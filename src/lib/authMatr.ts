/** Identifiant auth dérivé du matricule SONAL */
export function matrToEmail(matr: string): string {
  return `${matr.trim().toLowerCase()}@sonal.local`
}

/** Mot de passe Auth (min. 6 car.) aligné sur Mot_Passe TbLogin */
export function toAuthPassword(plainPassword: string): string {
  return plainPassword.length >= 6 ? plainPassword : `Sonal_${plainPassword}`
}

export function normalizeMatr(matr: string): string {
  return matr.trim()
}
