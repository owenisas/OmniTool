"use client";

import { compressImage } from "./compress-image";

/**
 * BlockNote `uploadFile` callback. Compresses images client-side, then
 * POSTs to /api/notes/upload. Returns the public URL string that the
 * editor stores in `block.props.url`.
 */
export async function uploadAttachment(file: File): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const prepared = isImage
    ? await compressImage(file)
    : {
        blob: file,
        contentType: file.type || "application/octet-stream",
        fileName: file.name,
      };

  const form = new FormData();
  // Wrap the (possibly recoded) blob in a File so the server sees a
  // filename + content-type without us needing extra form fields.
  const outFile =
    prepared.blob instanceof File && prepared.blob.name === prepared.fileName
      ? prepared.blob
      : new File([prepared.blob], prepared.fileName, {
          type: prepared.contentType,
        });
  form.append("file", outFile);

  const res = await fetch("/api/notes/upload", {
    method: "POST",
    body: form,
    credentials: "include",
  });

  if (!res.ok) {
    let message = `Upload failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new Error("Upload response missing url");
  return body.url;
}
