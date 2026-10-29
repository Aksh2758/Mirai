import { redirect } from 'next/navigation'

export default async function CodeServerRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  redirect(`/studio?projectId=${encodeURIComponent(projectId)}`)
}