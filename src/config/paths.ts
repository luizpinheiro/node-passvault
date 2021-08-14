import path from 'path'


export const VAULT_FOLDER_PATH = path.resolve(process.env.HOME || __dirname, '.node-passvault/')
export const VAULT_FILE_PATH = path.resolve(VAULT_FOLDER_PATH, 'vault.json')
