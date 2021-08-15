import { MainMenuOptions } from '../enums'

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
  salt: string
  iv: string
  authTag: string
}

export type GeneratePasswordOptions = {
  size: number
  specialChars: boolean
  exclude: string
}

export type VaultPassword = {
  hash: Buffer
  salt: Buffer
}

export type MenuOptionsHandler = Record<MainMenuOptions, () => Promise<void>>
