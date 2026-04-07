// In-memory store for File objects associated with form-data entries.
// Files are keyed by "requestId:entryId" to isolate duplicated tabs / saved requests.
// Cannot be persisted across reloads.

const files = new Map<string, File>();

function fileKey(requestId: string, entryId: string): string {
  return `${requestId}:${entryId}`;
}

export function setFile(requestId: string, entryId: string, file: File): void {
  files.set(fileKey(requestId, entryId), file);
}

export function getFile(requestId: string, entryId: string): File | undefined {
  return files.get(fileKey(requestId, entryId));
}

export function removeFile(requestId: string, entryId: string): void {
  files.delete(fileKey(requestId, entryId));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
