// Minimal API route placeholder — this app is 100% client-side.
// All physics calculations run in the browser via Zustand store.
// This route exists only to satisfy Next.js's default route convention.

export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    name: "Motor Thermal Digital Twin API",
    version: "1.0.0",
    status: "ok",
    note: "This application is fully client-side. All calculations run in the browser.",
  });
}
