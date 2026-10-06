export default function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
