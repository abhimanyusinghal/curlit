// In-memory store for File objects associated with form-data entries.
// Files are keyed by the FormDataEntry id and cannot be persisted across reloads.

const files = new Map<string, File>();

export function setFile(entryId: string, file: File): void {
  files.set(entryId, file);
}

export function getFile(entryId: string): File | undefined {
  return files.get(entryId);
}

export function removeFile(entryId: string): void {
  files.delete(entryId);
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
