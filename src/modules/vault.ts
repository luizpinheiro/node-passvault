import fs from 'fs'
import crypto from 'crypto'
import passwordGenerator from 'generate-password'

import { GeneratePasswordOptions, Vault, VaultWrapper } from '../types'
import { VAULT_FILE_PATH, VAULT_FOLDER_PATH } from '../config/paths'

export const vaultExists = (): boolean => fs.existsSync(VAULT_FILE_PATH)

export const createVault = (vaultPasswordHash: Buffer): Vault => {
  const vault: Vault = {
    totalItems: 0,
    credentials: [],
  }

  const iv = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest()
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultPasswordHash, iv)
  let encryptedData: string[] | string = []
  const encodedData = JSON.stringify(vault)
  encryptedData.push(cipher.update(encodedData, 'utf-8', 'base64'))
  encryptedData.push(cipher.final('base64'))
  encryptedData = encryptedData.join('')
  const vaultWrapper: VaultWrapper = {
    encryptedData,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
  if (!fs.existsSync(VAULT_FOLDER_PATH)) fs.mkdirSync(VAULT_FOLDER_PATH)
  fs.writeFileSync(VAULT_FILE_PATH, JSON.stringify(vaultWrapper), { encoding: 'utf-8' })
  console.log(`Vault securely stored on ${VAULT_FILE_PATH}`)
  return vault
}

export const passwordHash = (vaultPassword: string): Buffer =>
  crypto.createHash('sha256').update(vaultPassword).digest()

export const unlockVault = (vaultPasswordHash: Buffer): Vault | null => {
  try {
    const vaultWrapper: VaultWrapper = JSON.parse(
      fs.readFileSync(VAULT_FILE_PATH, { encoding: 'utf-8' }),
    )
    const authTag = Buffer.from(vaultWrapper.authTag, 'base64')
    const iv = Buffer.from(vaultWrapper.iv, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultPasswordHash, iv)
    decipher.setAuthTag(authTag)
    const vaultDecryptedData = []
    vaultDecryptedData.push(decipher.update(vaultWrapper.encryptedData, 'base64', 'utf-8'))
    vaultDecryptedData.push(decipher.final('utf-8'))
    return JSON.parse(vaultDecryptedData.join('')) as Vault
  } catch (e) {
    return null
  }
}

export const updateVault = (vault: Vault, vaultPasswordHash: Buffer): void => {
  const vaultWrapper: VaultWrapper = JSON.parse(
    fs.readFileSync(VAULT_FILE_PATH, { encoding: 'utf-8' }),
  )
  const iv = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest()
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultPasswordHash, iv)
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
