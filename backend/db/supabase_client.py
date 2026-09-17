import os
from supabase import create_client, Client

def get_supabase() -> Client:
    """Initialize and return a Supabase client."""
    url = os.environ.get("SUPABASE_URL")
    # Tries the specific APP key first, then Anon, falling back to empty to avoid instant crash
    key = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_ANON_KEY", "")) 
    return create_client(url, key)
