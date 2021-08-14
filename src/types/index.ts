export type Vault = {
  totalItems: number
  credentials: Credential[]
}

export type Credential = {
  identifier: string
  key: string
  secret: string
  website: string
}

export type VaultWrapper = {
  encryptedData: string
  iv: string
  authTag: string
}

export type GeneratePasswordOptions = {
  size: number
  specialChars: boolean
  exclude: string
}
