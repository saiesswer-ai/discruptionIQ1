"""
Modular AI assistance layer for DisruptionIQ.

Provides specialized advisory agents:
- DisruptionAnalyst: Evidence-grounded root cause and impact analysis.
- RecoveryAdvisor: Feasibility-respecting recovery plan trade-off explanation.
- OperationsReporter: Cross-functional operational status briefing.
"""
from app.agents.base import (
    BaseAgent,
    BaseLLMProvider,
    LLMError,
    LLMResponseError,
    LLMTimeoutError,
    MockLLMProvider,
    OpenAICompatibleProvider,
    get_llm_provider,
    mask_secret,
)
from app.agents.disruption_analyst import DisruptionAnalyst
from app.agents.operations_reporter import OperationsReporter
from app.agents.recovery_advisor import RecoveryAdvisor

__all__ = [
    "BaseAgent",
    "BaseLLMProvider",
    "DisruptionAnalyst",
    "LLMError",
    "LLMResponseError",
    "LLMTimeoutError",
    "MockLLMProvider",
    "OpenAICompatibleProvider",
    "OperationsReporter",
    "RecoveryAdvisor",
    "get_llm_provider",
    "mask_secret",
]
