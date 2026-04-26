import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

def serialize_doc(doc):
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/")
async def get_notifications():
    try:
        cursor = db.notifications.find().sort("timestamp", -1).limit(100)
        docs = await cursor.to_list(100)
        return [serialize_doc(d) for d in docs]
    except Exception as e:
        logger.error(f"Error fetching notifications: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/{notification_id}/read")
async def mark_read(notification_id: str):
    try:
        result = await db.notifications.update_one(
            {"_id": ObjectId(notification_id)},
            {"$set": {"read": True}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/mark-all-read")
async def mark_all_read():
    try:
        await db.notifications.update_many(
            {"read": False},
            {"$set": {"read": True}}
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error marking all as read: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
