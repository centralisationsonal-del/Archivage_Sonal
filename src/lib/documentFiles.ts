/** Extensions et types acceptés pour l’archivage / circulation */
export const ACCEPTED_DOCUMENT_EXTENSIONS =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp,.zip,.rar,.7z,.msg,.eml'

export const ACCEPTED_DOCUMENT_ACCEPT = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'text/plain',
  'text/csv',
  'image/*',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-outlook',
  'message/rfc822',
  ACCEPTED_DOCUMENT_EXTENSIONS,
].join(',')

export function fileExtension(name: string | null | undefined): string {
  if (!name) return '—'
  const i = name.lastIndexOf('.')
  if (i < 0 || i === name.length - 1) return '—'
  return name.slice(i + 1).toUpperCase()
}

export function typeDocFromFileName(name: string): string {
  const ext = fileExtension(name)
  return ext === '—' ? 'Fichier' : ext
}
