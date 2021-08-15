import fs from 'fs'
import crypto from 'crypto'
import passwordGenerator from 'generate-password'

import { Credential, GeneratePasswordOptions, Vault, VaultPassword, VaultWrapper } from '../types'
import { VAULT_FILE_PATH, VAULT_FOLDER_PATH } from '../config/paths'
import { VaultState } from '../enums'

let vault: Vault | null = null
let vaultPassword: VaultPassword | null = null
let vaultState: VaultState = VaultState.LOCKED

export const vaultExists = (): boolean => fs.existsSync(VAULT_FILE_PATH)

export const createVault = (vaultPlainPassword: string): Vault => {
  const salt = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest()
  const password = passwordHash(vaultPlainPassword, salt)

  const vault: Vault = {
    totalItems: 0,
    credentials: [],
  }

  const iv = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest()
  const cipher = crypto.createCipheriv('aes-256-gcm', password.hash, iv)
  let encryptedData: string[] | string = []
  const encodedData = JSON.stringify(vault)
  encryptedData.push(cipher.update(encodedData, 'utf-8', 'base64'))
  encryptedData.push(cipher.final('base64'))
  encryptedData = encryptedData.join('')
  const vaultWrapper: VaultWrapper = {
    encryptedData,
    salt: password.salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
  if (!fs.existsSync(VAULT_FOLDER_PATH)) fs.mkdirSync(VAULT_FOLDER_PATH)
  fs.writeFileSync(VAULT_FILE_PATH, JSON.stringify(vaultWrapper), { encoding: 'utf-8' })
  console.log(`Vault securely stored on ${VAULT_FILE_PATH}`)
  return vault
}

export const passwordHash = (
  vaultPassword: string,
  currentSalt: Buffer | null = null,
): VaultPassword => {
  const salt = currentSalt || crypto.randomBytes(16)
  return {
    salt,
    hash: crypto.pbkdf2Sync(vaultPassword, salt, 1000, 32, 'sha256'),
  }
}

export const unlockVault = (vaultPlainPassword: string): boolean => {
  try {
    const vaultWrapper: VaultWrapper = JSON.parse(
      fs.readFileSync(VAULT_FILE_PATH, { encoding: 'utf-8' }),
    )
    vaultPassword = passwordHash(vaultPlainPassword, Buffer.from(vaultWrapper.salt, 'base64'))
    const authTag = Buffer.from(vaultWrapper.authTag, 'base64')
    const iv = Buffer.from(vaultWrapper.iv, 'base64')
    const salt = Buffer.from(vaultWrapper.salt, 'base64')
    vaultPassword = passwordHash(vaultPlainPassword, salt)
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultPassword.hash, iv)
    decipher.setAuthTag(authTag)
    const vaultDecryptedData = []
    vaultDecryptedData.push(decipher.update(vaultWrapper.encryptedData, 'base64', 'utf-8'))
    vaultDecryptedData.push(decipher.final('utf-8'))
    vault = JSON.parse(vaultDecryptedData.join('')) as Vault
    vaultState = VaultState.UNLOCKED
    return true
  } catch (e) {
    return false
  }
}

export const lockVault = (): void => {
  vault = null
  vaultPassword = null
  vaultState = VaultState.LOCKED
}

export const updateVault = (): void => {
  if (vaultState === VaultState.LOCKED || vaultPassword === null)
    throw new Error('The vault is locked!')

  const vaultWrapper: VaultWrapper = JSON.parse(
    fs.readFileSync(VAULT_FILE_PATH, { encoding: 'utf-8' }),
  )
  const iv = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest()
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultPassword.hash, iv)
  let encryptedData: string[] | string = []
  const encodedData = JSON.stringify(vault)
  encryptedData.push(cipher.update(encodedData, 'utf-8', 'base64'))
  encryptedData.push(cipher.final('base64'))
  encryptedData = encryptedData.join('')
  vaultWrapper.encryptedData = encryptedData
  vaultWrapper.authTag = cipher.getAuthTag().toString('base64')
  vaultWrapper.iv = iv.toString('base64')
  fs.writeFileSync(VAULT_FILE_PATH, JSON.stringify(vaultWrapper), { encoding: 'utf-8' })
}

export const generateStrongPassword = (options: GeneratePasswordOptions) =>
  passwordGenerator.generate({
    length: options.size,
    symbols: options.specialChars,
    numbers: true,
    lowercase: true,
    uppercase: true,
    strict: true,
    exclude: options.exclude,
  })

export const validateStrongPassword = (password: string) => {
  if (password.length < 8) return false
  if (password.match(/^[^0-9]+$/)) return false
  if (password.match(/^[^A-Z]+$/)) return false
  if (password.match(/^[^a-z]+$/)) return false
  if (!password.match(/[^0-9A-Za-z]/)) return false
  return true
}

export const getVaultState = (): VaultState => vaultState

export const getCredentials = (): ReadonlyArray<Credential> => {
  if (!vault || vaultState === VaultState.LOCKED) throw new Error('Vault is locked')
  return Object.freeze([...vault.credentials])
}

export const getSize = (): number => {
  if (!vault || vaultState === VaultState.LOCKED) throw new Error('Vault is locked')
  return vault.totalItems
}

export const addCredential = (credential: Credential): void => {
  if (vaultState === VaultState.LOCKED || vault === null) throw new Error('Vault is locked')
  if (vault.credentials.some((c) => c.identifier === credential.identifier))
    throw new Error('Credential already exists')

  vault.credentials.push(credential)
  vault.totalItems += 1
  updateVault()
}

export const removeCredential = (credential: Credential): void => {
  if (vaultState === VaultState.LOCKED || vault === null) throw new Error('Vault is locked')
  vault.credentials = vault.credentials.filter((c) => c !== credential)
  updateVault()
}

export const checkCurrentPassword = (plainPassword: string): boolean => {
  if (vaultPassword === null) throw new Error('Unexpected null vault password')
  const hash = passwordHash(plainPassword, vaultPassword.salt)
  return hash.hash.equals(vaultPassword.hash as Buffer)
}

export const changePassword = (plainPassword: string): void => {
  vaultPassword = passwordHash(plainPassword)
  updateVault()
}

export const locked = (): boolean => vaultState === VaultState.LOCKED
