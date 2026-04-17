"""
MongoDB connection manager using Motor (async driver).
Provides a singleton database instance across the application.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import get_settings

settings = get_settings()


class Database:
    """Singleton MongoDB connection manager."""

    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    async def connect(cls):
        """Initialize MongoDB connection."""
        cls.client = AsyncIOMotorClient(settings.MONGO_URI)
        cls.db = cls.client.get_default_database()
        # Verify connection
        await cls.client.admin.command("ping")
        print(f"✅ Connected to MongoDB: {cls.db.name}")

    @classmethod
    async def disconnect(cls):
        """Close MongoDB connection."""
        if cls.client:
            cls.client.close()
            print("🔌 MongoDB connection closed")

    @classmethod
    def get_db(cls):
        """Get database instance."""
        return cls.db

    @classmethod
    def get_collection(cls, name: str):
        """Get a specific collection by name."""
        return cls.db[name]


# Convenience function for dependency injection
def get_database():
    """FastAPI dependency — returns the database instance."""
    return Database.get_db()
