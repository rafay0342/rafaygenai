export type TemplateMediaFile = {
  filename: string;
  subfolder?: string;
  type?: string;
  kind?: string;
  url?: string;
  baseUrl?: string;
};

export function buildMediaUrl(file: TemplateMediaFile) {
  if (file.url) return file.url;
  const params = new URLSearchParams();
  params.set("filename", file.filename);
  if (file.subfolder) params.set("subfolder", file.subfolder);
  if (file.type) params.set("type", file.type);
  if (file.baseUrl) params.set("baseUrl", file.baseUrl);
  return `/api/media/file?${params.toString()}`;
}

export function buildMediaDownloadUrl(file: TemplateMediaFile) {
  if (file.url?.startsWith("data:")) return file.url;
  const params = new URLSearchParams();
  if (file.url && /^https?:\/\//i.test(file.url)) {
    params.set("url", file.url);
    params.set("downloadName", file.filename);
    params.set("download", "true");
    return `/api/media/file?${params.toString()}`;
  }
  params.set("filename", file.filename);
  if (file.subfolder) params.set("subfolder", file.subfolder);
  if (file.type) params.set("type", file.type);
  if (file.baseUrl) params.set("baseUrl", file.baseUrl);
  params.set("downloadName", file.filename);
  params.set("download", "true");
  return `/api/media/file?${params.toString()}`;
}
