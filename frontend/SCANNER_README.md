# MIRAI Scanner Frontend

## Overview
Next.js 15 (App Router) frontend for the MIRAI Scanner Module with a modern, responsive UI for scanning GitHub profiles and resumes.

## Features
- **Modern UI**: Built with Tailwind CSS and Lucide Icons
- **File Upload**: Drag-and-drop PDF upload interface
- **GitHub Integration**: Enter GitHub username or URL
- **Real-time Results**: Display skills, projects, experience, and role predictions
- **Error Handling**: User-friendly error messages and validation
- **Responsive Design**: Works seamlessly on desktop and mobile

## Component Structure

### ScannerPage (`/scanner`)
Main component at `/src/app/scanner/page.tsx` with:
- GitHub URL input
- PDF drag-and-drop upload
- Results display showing:
  - Skills (as tags)
  - Role predictions with match percentages
  - Project count
  - Experience entries count

## Setup

### Install Dependencies
```bash
cd frontend
npm install
```

The following packages are already included:
- `@monaco-editor/react` - For code editing (available for future features)
- `lucide-react` - Icon library
- `@supabase/supabase-js` - Supabase client
- `axios` - HTTP client
- `ai` - Vercel AI SDK (available for future AI features)
- `next` - Next.js framework
- `react` - React library
- `typescript` - TypeScript support
- `tailwindcss` - Styling
- `postcss` - CSS processing
- `eslint` - Code linting

## Running the Application

### Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Production Build
```bash
npm run build
npm start
```

### Linting
```bash
npm run lint
```

## API Integration

The scanner connects to the backend at `http://localhost:8000/api/v1/scan`

### Request Format
```
POST /api/v1/scan
Content-Type: multipart/form-data

github_url: string (GitHub URL or username)
file: File (PDF file)
```

### Response Format
```json
{
  "status": "success",
  "message": "Profile scanned and saved successfully",
  "data": {
    "skills": ["Python", "React", ...],
    "projects": [...],
    "experience": [...],
    "certifications": [...],
    "rolePredictions": [...],
    "github_username": "username",
    "repository_count": 5
  }
}
```

## File Structure
```
frontend/
├── src/
│   └── app/
│       ├── scanner/
│       │   └── page.tsx (Scanner component)
│       ├── layout.tsx (Root layout)
│       ├── page.tsx (Homepage)
│       └── globals.css (Global styles)
├── public/ (Static assets)
├── package.json
├── next.config.ts
├── tsconfig.json
└── tailwind.config.ts
```

## Styling

The application uses Tailwind CSS with custom color scheme:
- **Primary**: Purple (#9333ea)
- **Secondary**: Pink (#ec4899)
- **Background**: Slate (#0f172a)

## Environment Variables

Add to `.env.local` (optional for frontend, mainly backend):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Error Handling

The scanner handles various error scenarios:
- Invalid GitHub user (HTTP 404)
- Invalid PDF file (HTTP 400)
- Missing required fields
- Network errors
- Server errors (HTTP 500)

User-friendly error messages are displayed in the UI.

## Performance

- **Client-side validation** before API calls
- **Loading states** during file upload and processing
- **Optimized images** and assets
- **Code splitting** with Next.js App Router

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Future Enhancements

- **Monaco Editor integration** for code view
- **Vercel AI SDK** for chat-based insights
- **Video profile scanning** support
- **Real-time progress** indicators
- **Export PDF reports** with detailed analysis
