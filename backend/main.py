import os
from datetime import datetime
from typing import Optional, List
import uvicorn
import base64
import uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from bson import ObjectId

# Load environment variables
load_dotenv() 

# MongoDB Setup
mongodb_password = os.getenv('MONGODB_PASSWORD')
uri = f"mongodb+srv://elinakocarslan_db_user:{mongodb_password}@gallery.adiobn2.mongodb.net/?appName=gallery"
# Lazy connection - don't connect until first use
client = None
db = None
collection = None

def get_collection():
    global client, db, collection
    if collection is None:
        client = MongoClient(uri, server_api=ServerApi('1'), serverSelectionTimeoutMS=5000)
        db = client["sight_data"]
        collection = db["artifacts"]
    return collection

# Pydantic Models for API validation
class ImageAnalysisRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    image_name: str
    analysis_type: str  # "museum", "text", "general", etc.
    descriptions: Optional[List[str]] = []  # List of generated descriptions (optional)
    metadata: Optional[dict] = {}  # Additional metadata like location, tags, etc.

class ImageAnalysisResponse(BaseModel):
    id: str
    image_name: str
    analysis_type: str
    descriptions: List[str]
    metadata: dict
    created_at: datetime
    updated_at: datetime

class ImageAnalysisUpdate(BaseModel):
    descriptions: Optional[List[str]] = None
    metadata: Optional[dict] = None

# FastAPI App
app = FastAPI(title="Art Beyond Sight API", version="1.0.0")

# Create temp directory for images
TEMP_IMAGE_DIR = Path("temp_images")
TEMP_IMAGE_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/temp_images", StaticFiles(directory="temp_images"), name="temp_images")

# Enable CORS for your Expo app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc:
        doc['id'] = str(doc['_id'])
        doc.pop('_id', None)
        # Convert datetime objects to ISO format strings for JSON serialization
        if 'created_at' in doc and doc['created_at']:
            if hasattr(doc['created_at'], 'isoformat'):
                doc['created_at'] = doc['created_at'].isoformat()
        if 'updated_at' in doc and doc['updated_at']:
            if hasattr(doc['updated_at'], 'isoformat'):
                doc['updated_at'] = doc['updated_at'].isoformat()
    return doc

# API Endpoints

class UploadImageRequest(BaseModel):
    image_base64: str  # data:image/jpeg;base64,... format

class UploadImageResponse(BaseModel):
    image_url: str
    image_id: str

@app.post("/api/upload-temp-image", response_model=UploadImageResponse)
async def upload_temp_image(request: UploadImageRequest):
    """
    Upload a base64 image and get back an HTTP URL for use with Navigator API
    """
    try:
        # Extract base64 data
        if request.image_base64.startswith("data:"):
            # Remove data URL prefix
            base64_data = request.image_base64.split(",", 1)[1]
        else:
            base64_data = request.image_base64
        
        # Decode base64
        image_bytes = base64.b64decode(base64_data)
        
        # Generate unique filename
        image_id = str(uuid.uuid4())
        filename = f"{image_id}.jpg"
        filepath = TEMP_IMAGE_DIR / filename
        
        # Save image
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        
        # Return URL (adjust host/port as needed)
        image_url = f"http://localhost:8000/temp_images/{filename}"
        
        print(f"✅ Uploaded temp image: {image_url}")
        return UploadImageResponse(image_url=image_url, image_id=image_id)
    
    except Exception as e:
        print(f"❌ Failed to upload image: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to upload image: {str(e)}")

@app.post("/api/image-analysis", response_model=ImageAnalysisResponse)
async def create_image_analysis(analysis: ImageAnalysisRequest):
    """
    Endpoint for your teammate's TSX code to submit image analysis data
    """
    print(f"📥 Received analysis request: {analysis.image_name} - {analysis.analysis_type}")
    
    # Prepare document
    doc = {
        "image_name": analysis.image_name,
        "analysis_type": analysis.analysis_type,
        "descriptions": analysis.descriptions or [],
        "metadata": analysis.metadata or {},
        "image_url": analysis.image_url,
        "image_base64": analysis.image_base64,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    # Try MongoDB, but continue without it if it fails
    doc_id = None
    try:
        print(f"📤 Attempting to insert into MongoDB...")
        coll = get_collection()
        result = coll.insert_one(doc)
        doc_id = str(result.inserted_id)
        print(f"✅ Document saved to MongoDB with ID: {doc_id}")
    except Exception as mongo_error:
        print(f"⚠️  MongoDB unavailable: {type(mongo_error).__name__}")
        print(f"⚠️  Continuing without database (analysis still works)")
        # Generate a mock ID
        from datetime import datetime
        doc_id = f"mock_{datetime.now().timestamp()}"
    
    # Return response with or without database
    response = {
        "id": doc_id,
        "image_name": doc["image_name"],
        "analysis_type": doc["analysis_type"],
        "descriptions": doc["descriptions"],
        "metadata": doc["metadata"],
        "created_at": doc["created_at"].isoformat(),
        "updated_at": doc["updated_at"].isoformat(),
    }
    
    print(f"✅ Analysis endpoint completed successfully")
    return response

@app.get("/api/image-analysis", response_model=List[ImageAnalysisResponse])
async def get_all_analyses(analysis_type: Optional[str] = None, limit: int = 50):
    """
    Get all image analyses, optionally filtered by analysis type
    """
    try:
        coll = get_collection()
        query = {}
        if analysis_type:
            query["analysis_type"] = analysis_type
            
        cursor = coll.find(query).sort("created_at", -1).limit(limit)
        analyses = [serialize_doc(doc) for doc in cursor]
        return analyses
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve analyses: {str(e)}")

@app.get("/api/image-analysis/{analysis_id}", response_model=ImageAnalysisResponse)
async def get_analysis_by_id(analysis_id: str):
    """
    Get a specific image analysis by ID
    """
    try:
        coll = get_collection()
        doc = coll.find_one({"_id": ObjectId(analysis_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Analysis not found")
        return serialize_doc(doc)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve analysis: {str(e)}")

@app.get("/api/image-analysis/search/{image_name}", response_model=List[ImageAnalysisResponse])
async def search_analyses_by_name(image_name: str):
    """
    Search for analyses by image name (fuzzy search)
    """
    try:
        coll = get_collection()
        query = {"image_name": {"$regex": image_name, "$options": "i"}}
        cursor = coll.find(query).sort("created_at", -1)
        analyses = [serialize_doc(doc) for doc in cursor]
        return analyses
        
    except Exception as e:
        print(f"MongoDB search error: {str(e)}")
        # Return empty list if MongoDB is unavailable instead of failing
        return []

@app.put("/api/image-analysis/{analysis_id}", response_model=ImageAnalysisResponse)
async def update_analysis(analysis_id: str, update_data: ImageAnalysisUpdate):
    """
    Update an existing image analysis
    """
    try:
        coll = get_collection()
        update_doc = {"updated_at": datetime.utcnow()}
        
        if update_data.descriptions is not None:
            update_doc["descriptions"] = update_data.descriptions
        if update_data.metadata is not None:
            update_doc["metadata"] = update_data.metadata
            
        result = coll.update_one(
            {"_id": ObjectId(analysis_id)}, 
            {"$set": update_doc}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Analysis not found")
            
        updated_doc = coll.find_one({"_id": ObjectId(analysis_id)})
        return serialize_doc(updated_doc)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update analysis: {str(e)}")

@app.post("/api/image-analysis", response_model=ImageAnalysisResponse)
async def create_or_update_image_analysis(analysis: ImageAnalysisRequest):
    """
    Insert new analysis or update existing one if image_name already exists.
    """
    try:
        coll = get_collection()
        query = {"image_name": analysis.image_name, "analysis_type": analysis.analysis_type}
        existing = coll.find_one(query)
        
        doc = {
            "image_name": analysis.image_name,
            "analysis_type": analysis.analysis_type,
            "descriptions": analysis.descriptions,
            "metadata": analysis.metadata or {},
            "image_url": analysis.image_url,
            "image_base64": analysis.image_base64,
            "updated_at": datetime.now(datetime.timezone.utc),
        }

        if existing:
            # Update existing record
            coll.update_one(query, {"$set": doc})
            updated_doc = coll.find_one(query)
            return serialize_doc(updated_doc)
        else:
            # Create new record
            doc["created_at"] = datetime.utcnow()
            result = coll.insert_one(doc)
            created_doc = coll.find_one({"_id": result.inserted_id})
            return serialize_doc(created_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save or update analysis: {str(e)}")

@app.get("/api/health")
async def health_check():
    """
    Simple health check endpoint
    """
    return {"status": "healthy", "timestamp": datetime.utcnow()}

class DetectArtworkRequest(BaseModel):
    image_url: str

class DetectArtworkResponse(BaseModel):
    title: str
    description: str
    confidence: float

@app.post("/api/detect-artwork", response_model=DetectArtworkResponse)
async def detect_artwork(request: DetectArtworkRequest):
    """
    Quick artwork detection using Overshoot API
    Returns the artwork name/title for fast lookup
    """
    try:
        import requests
        
        overshoot_api_key = os.getenv('NEXT_PUBLIC_OVERSHOOT_API_KEY')
        if not overshoot_api_key:
            raise HTTPException(status_code=500, detail="Overshoot API key not configured")
        
        # Call Overshoot API for quick detection
        prompt = """Identify the artwork in this image. Respond with JSON:
{
  "title": "exact artwork name or empty string if unknown",
  "description": "brief description of what you see",
  "confidence": 0-100
}"""
        
        response = requests.post(
            "https://cluster1.overshoot.ai/api/v0.2/vision/analyze",
            headers={
                "Authorization": f"Bearer {overshoot_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "image_url": request.image_url,
                "prompt": prompt,
                "model": "Qwen/Qwen3-VL-30B-A3B-Instruct",
            },
            timeout=15,
        )
        
        if not response.ok:
            print(f"Overshoot API error: {response.status_code}")
            raise HTTPException(status_code=500, detail="Overshoot detection failed")
        
        result = response.json()
        
        # Try to parse the response
        try:
            import json
            # Extract JSON from response
            content = result.get("result", result.get("content", "{}"))
            if isinstance(content, str):
                # Try to find JSON in string
                import re
                json_match = re.search(r'\{[^}]+\}', content)
                if json_match:
                    data = json.loads(json_match.group(0))
                else:
                    data = {"title": "", "description": content, "confidence": 50}
            else:
                data = content
            
            return DetectArtworkResponse(
                title=data.get("title", ""),
                description=data.get("description", ""),
                confidence=data.get("confidence", 50),
            )
        except Exception as parse_error:
            print(f"Failed to parse Overshoot response: {parse_error}")
            # Return empty title to fall back to vision analysis
            return DetectArtworkResponse(
                title="",
                description=str(result),
                confidence=0,
            )
            
    except Exception as e:
        print(f"Overshoot detection error: {str(e)}")
        # Don't fail the request - return empty to trigger fallback
        return DetectArtworkResponse(
            title="",
            description="Detection unavailable",
            confidence=0,
        )

# MongoDB connection is lazy - will connect on first use
print("✅ Backend API ready")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

