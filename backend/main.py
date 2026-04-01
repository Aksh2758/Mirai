"""
Main entry point for the Nirmaan Scanner Backend.
Configures CORS, includes routers, and defines health check endpoints.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import routers
from routers import scanner, analyzer, studio

# Load environment variables from .env at project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(
    title="Nirmaan API",
    version="1.0.0"
)

# CORS configuration
# localhost:3000 is the default for most frontend dev servers (React/Next.js)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(scanner.router, prefix="/scanner", tags=["scanner"])
app.include_router(analyzer.router, prefix="/analyzer", tags=["analyzer"])
app.include_router(studio.router, prefix="/studio", tags=["studio"])

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    # Run the app using uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
