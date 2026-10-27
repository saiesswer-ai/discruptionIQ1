"""Strict carrier-webhook contract; aliases match the public JSON API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CarrierWebhook(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    event_id: str = Field(min_length=1, max_length=128, alias="eventId")
    tracking_number: str = Field(min_length=1, max_length=64, alias="trackingNumber")
    event_type: Literal["shipment_updated", "delay_reported", "delivered"] = Field(alias="eventType")
    occurred_at: datetime = Field(alias="occurredAt")
    status: Literal["on_schedule", "delayed", "customs_hold", "rerouted", "delivered"]
    estimated_delivery_date: datetime = Field(alias="estimatedDeliveryDate")
    location: str | None = Field(default=None, max_length=128)
    reason: str | None = Field(default=None, max_length=512)
