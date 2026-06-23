/** Safe filename segment from complaint point name (no extension). */
export function complaintPointQrFilenameBase(name: string): string {
  const slug = String(name || "point")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.slice(0, 80) || "point";
}

export function complaintPointQrDownloadFilename(name: string): string {
  return `complaint-point-${complaintPointQrFilenameBase(name)}.png`;
}

/** Trigger download of a canvas element as PNG. */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
