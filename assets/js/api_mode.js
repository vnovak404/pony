export let HAS_API = false;

export async function detectApi() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return (HAS_API = false);
    const data = await res.json().catch(() => null);
    return (HAS_API = !!(data && data.ok === true));
  } catch {
    return (HAS_API = false);
  }
}

export const apiUrl = (path) => `/api${path}`;
