"""
GitHub Deploy Service — Real GitHub Integration
Creates a repo, pushes all project code files, creates a proper README.
Uses the user's stored GitHub OAuth token from Supabase.
"""

import httpx
import base64
import os
from typing import Optional


GITHUB_API = "https://api.github.com"


async def create_github_repo(
    token: str,
    repo_name: str,
    description: str,
    private: bool = False,
) -> dict:
    """
    Creates a new GitHub repository for the user.
    Returns repo data including html_url and clone_url.
    Raises ValueError if creation fails.
    """
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }

    payload = {
        "name": repo_name,
        "description": description,
        "private": private,
        "auto_init": False,  # We push manually
        "has_issues": True,
        "has_projects": False,
        "has_wiki": False,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{GITHUB_API}/user/repos",
            headers=headers,
            json=payload,
        )

    if resp.status_code == 422:
        # Repo already exists — try to get it
        user_resp_data = await _get_authenticated_user(token)
        username = user_resp_data.get("login", "user")
        async with httpx.AsyncClient(timeout=20.0) as client:
            get_resp = await client.get(
                f"{GITHUB_API}/repos/{username}/{repo_name}",
                headers=headers,
            )
        if get_resp.status_code == 200:
            return get_resp.json()
        raise ValueError(f"Repository already exists but could not be accessed.")

    if resp.status_code not in (200, 201):
        raise ValueError(f"GitHub repo creation failed: {resp.status_code} — {resp.text[:300]}")

    return resp.json()


async def push_files_to_repo(
    token: str,
    owner: str,
    repo_name: str,
    code_files: list[dict],
    project_title: str,
    project_brief: str,
    tech_stack: list[str],
    psi_score: Optional[int] = None,
) -> str:
    """
    Pushes all code files to the GitHub repo using the GitHub Contents API.
    Also generates and pushes a proper README.md.
    Returns the repo HTML URL.
    """
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }

    # Build README content
    readme_content = _generate_readme(
        project_title=project_title,
        project_brief=project_brief,
        tech_stack=tech_stack,
        psi_score=psi_score,
        files=[f["filename"] for f in code_files],
    )

    # Files to push: README first, then all code files
    files_to_push = [{"filename": "README.md", "content": readme_content}] + code_files

    async with httpx.AsyncClient(timeout=30.0) as client:
        for file_obj in files_to_push:
            filename = file_obj["filename"]
            content = file_obj.get("content", "")

            # GitHub API requires base64 encoded content
            encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")

            # Check if file already exists (to get its SHA for update)
            sha = await _get_file_sha(client, headers, owner, repo_name, filename)

            payload: dict = {
                "message": f"Add {filename}" if not sha else f"Update {filename}",
                "content": encoded,
            }
            if sha:
                payload["sha"] = sha

            resp = await client.put(
                f"{GITHUB_API}/repos/{owner}/{repo_name}/contents/{filename}",
                headers=headers,
                json=payload,
            )

            if resp.status_code not in (200, 201):
                raise ValueError(
                    f"Failed to push {filename}: {resp.status_code} — {resp.text[:200]}"
                )

    return f"https://github.com/{owner}/{repo_name}"


async def _get_file_sha(client: httpx.AsyncClient, headers: dict, owner: str, repo: str, path: str) -> Optional[str]:
    """Gets the SHA of an existing file in the repo (needed to update it). Returns None if file doesn't exist."""
    try:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
            headers=headers,
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json().get("sha")
    except Exception:
        pass
    return None


async def _get_authenticated_user(token: str) -> dict:
    """Returns the authenticated GitHub user's data."""
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{GITHUB_API}/user", headers=headers)
        resp.raise_for_status()
        return resp.json()


def _generate_readme(
    project_title: str,
    project_brief: str,
    tech_stack: list[str],
    psi_score: Optional[int],
    files: list[str],
) -> str:
    """Generates a clean, professional README.md for the project."""
    tech_badges = " ".join([f"`{t}`" for t in tech_stack])
    file_list = "\n".join([f"- `{f}`" for f in files if f != "README.md"])
    psi_line = f"\n## 📊 Nirmaan PSI Score\n\n**{psi_score}/100** — Evaluated on Code Quality, Security, Performance & Industry Fit.\n" if psi_score else ""

    return f"""# {project_title}

> {project_brief}

## 🛠️ Tech Stack

{tech_badges}

## 📁 Project Structure

{file_list}
{psi_line}
## 🚀 Getting Started

1. Clone this repository
```bash
git clone https://github.com/your-username/{_slugify(project_title)}.git
cd {_slugify(project_title)}
```

2. Install dependencies and run the project

## 🏗️ Built with Nirmaan

This project was built using [Nirmaan](https://nirmaan.app) — an AI-driven Build-to-Hire platform that helps students build real, job-ready projects with AI guidance.

---

*Generated by Nirmaan AI Studio*
"""


def _slugify(text: str) -> str:
    """Converts a project title to a URL-safe slug."""
    import re
    slug = text.lower().replace(" ", "-")
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:40] or "project"
