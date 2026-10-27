"""Provider abstraction, base agent, structured logging, and fallback machinery."""
from __future__ import annotations

import abc
import json
import logging
import re
import time
from typing import Any, Callable, TypeVar
from pydantic import BaseModel, ValidationError

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger("app.agents")

T = TypeVar("T", bound=BaseModel)


def mask_secret(secret: str | None) -> str:
    """Mask a secret for logging purposes so API keys are never exposed."""
    if not secret:
        return "[NOT SET]"
    if len(secret) <= 8:
        return "[REDACTED]"
    return f"{secret[:3]}...{secret[-4:]}"


class LLMError(Exception):
    """Base exception for all LLM provider failures."""


class LLMTimeoutError(LLMError):
    """Raised when an LLM provider request times out."""


class LLMResponseError(LLMError):
    """Raised when an LLM provider returns an HTTP error or invalid response."""


class BaseLLMProvider(abc.ABC):
    """Abstract interface for LLM completions."""

    @abc.abstractmethod
    def complete(self, messages: list[dict[str, str]], temperature: float = 0.0) -> str:
        """Execute a completion and return raw text string."""
        pass


class MockLLMProvider(BaseLLMProvider):
    """
    Test and development provider.

    Can be programmed with canned responses, custom handler functions,
    or simulated exceptions (timeouts, 500s).
    """

    def __init__(
        self,
        default_response: str | None = None,
        handler: Callable[[list[dict[str, str]]], str] | None = None,
        should_timeout: bool = False,
        error_to_raise: Exception | None = None,
    ):
        self.default_response = default_response or "{}"
        self.handler = handler
        self.should_timeout = should_timeout
        self.error_to_raise = error_to_raise
        self.call_history: list[list[dict[str, str]]] = []

    def complete(self, messages: list[dict[str, str]], temperature: float = 0.0) -> str:
        self.call_history.append(messages)
        if self.should_timeout:
            raise LLMTimeoutError("Simulated LLM call timed out after configured deadline.")
        if self.error_to_raise:
            raise self.error_to_raise
        if self.handler:
            return self.handler(messages)
        return self.default_response


class OpenAICompatibleProvider(BaseLLMProvider):
    """
    Standard HTTP client for OpenAI-compatible LLM endpoints.
    Uses httpx with timeouts and sanitised logging.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4o-mini",
        base_url: str | None = None,
        timeout_seconds: float = 8.0,
    ):
        self.api_key = api_key or ""
        self.model = model
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.timeout_seconds = timeout_seconds

    def complete(self, messages: list[dict[str, str]], temperature: float = 0.0) -> str:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        url = f"{self.base_url}/chat/completions"

        masked_key = mask_secret(self.api_key)
        logger.info(
            "Calling LLM provider",
            extra={
                "provider": "openai_compatible",
                "endpoint": url,
                "model": self.model,
                "timeout_seconds": self.timeout_seconds,
                "api_key_masked": masked_key,
            },
        )

        start_time = time.perf_counter()
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
                logger.info(
                    "LLM provider responded successfully",
                    extra={"model": self.model, "elapsed_ms": elapsed_ms},
                )
                return content
        except httpx.TimeoutException as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning(
                "LLM provider timed out",
                extra={"model": self.model, "timeout_seconds": self.timeout_seconds, "elapsed_ms": elapsed_ms},
            )
            raise LLMTimeoutError(f"LLM request timed out after {self.timeout_seconds}s") from exc
        except httpx.HTTPStatusError as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning(
                "LLM provider HTTP error",
                extra={"status_code": exc.response.status_code, "elapsed_ms": elapsed_ms},
            )
            raise LLMResponseError(f"LLM returned HTTP {exc.response.status_code}") from exc
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                "LLM provider request failed",
                extra={"error_type": type(exc).__name__, "elapsed_ms": elapsed_ms},
            )
            raise LLMError(f"LLM request failed: {type(exc).__name__}") from exc


def get_llm_provider(settings: Settings | None = None) -> BaseLLMProvider:
    """Factory creating the configured provider based on application settings."""
    app_settings = settings or get_settings()
    provider_type = (app_settings.llm_provider or "mock").lower()

    if provider_type == "openai":
        return OpenAICompatibleProvider(
            api_key=app_settings.llm_api_key,
            model=app_settings.llm_model,
            base_url=app_settings.llm_base_url,
            timeout_seconds=app_settings.llm_timeout_seconds,
        )

    # Default to mock provider for local development, tests, or unspecified types
    return MockLLMProvider()


def extract_json(raw_text: str) -> dict[str, Any]:
    """Parse JSON from model output, stripping markdown code fences if present."""
    text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()
    return json.loads(text)


class BaseAgent:
    """Base agent providing robust error handling, JSON validation, and deterministic fallbacks."""

    def __init__(
        self,
        provider: BaseLLMProvider | None = None,
        settings: Settings | None = None,
    ):
        self.settings = settings or get_settings()
        self.provider = provider or get_llm_provider(self.settings)

    def _call_llm_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
        fallback_factory: Callable[[], T],
    ) -> T:
        """
        Invoke the provider and validate against a Pydantic schema.
        Falls back deterministically upon ANY failure or when AI is disabled.
        """
        agent_name = self.__class__.__name__

        # If AI is disabled via config, immediately return the deterministic fallback
        if not self.settings.ai_enabled:
            logger.info(
                "AI layer is disabled in settings; returning deterministic fallback",
                extra={"agent": agent_name},
            )
            return fallback_factory()

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            raw_text = self.provider.complete(messages)
            parsed_dict = extract_json(raw_text)
            validated = schema.model_validate(parsed_dict)
            logger.info("Structured agent output successfully validated", extra={"agent": agent_name})
            return validated
        except (LLMTimeoutError, LLMResponseError, LLMError) as exc:
            logger.warning(
                "LLM provider error encountered; using deterministic fallback",
                extra={"agent": agent_name, "error_type": type(exc).__name__, "error_detail": str(exc)},
            )
            return fallback_factory()
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.warning(
                "LLM output failed JSON/Pydantic validation; using deterministic fallback",
                extra={"agent": agent_name, "error_type": type(exc).__name__, "error_detail": str(exc)},
            )
            return fallback_factory()
        except Exception as exc:
            logger.error(
                "Unexpected error during agent execution; using deterministic fallback",
                extra={"agent": agent_name, "error_type": type(exc).__name__, "error_detail": str(exc)},
            )
            return fallback_factory()
