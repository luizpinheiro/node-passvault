import inquirer from 'inquirer'
import { clearTimeout } from 'timers'
import clipboardy from 'clipboardy'

import { VaultState } from './enums'
import { Vault } from './types'
import {
  createVault,
  generateStrongPassword,
  passwordHash,
  unlockVault,
  updateVault,
  validateStrongPassword,
  vaultExists,
} from './modules/vault'

const IDLE_SECONDS = 30
let vaultState = VaultState.LOCKED
let vault: Vault | null = null
let vaultPasswordHash: Buffer
let idleTimeoutId: NodeJS.Timeout | null = null
let lastGeneratedPassword: string | null = null

const main = async (): Promise<void> => {
  if (!vaultExists()) {
    console.log('---- NO VAULT FOUND, CREATING... ---')
    let prePassword
    let checkPassword
    let weakPass
    do {
      prePassword = await inquirer.prompt({
        type: 'password',
        name: 'password',
        message: 'Provide a master password for your NEW vault:',
      })
      checkPassword = await inquirer.prompt({
        type: 'password',
        name: 'password',
        message: 'Type it again so we can be sure you made no mistakes:',
      })
      weakPass = !validateStrongPassword(prePassword.password)
      if (weakPass)
        console.log(
          'Your password is too weak!\nIt MUST be at least 12 chars long and have upper and lower case letters, numbers and special chars. You also SHOULD NOT use the password you choose anywhere else!',
        )
      else if (prePassword.password !== checkPassword.password)
        console.log('Provided passwords does not match!')
    } while (weakPass || prePassword.password !== checkPassword.password)

    vaultPasswordHash = passwordHash(prePassword.password)
    createVault(vaultPasswordHash)
    console.log('Great! We have created your vault!!!')
    return main()
  }

  do {
    const inputPassword = await inquirer.prompt({
      type: 'password',
      name: 'password',
      message: 'Provide the master password of your vault:',
    })
    vaultPasswordHash = passwordHash(inputPassword.password)
    vault = unlockVault(vaultPasswordHash)
    if (!vault) console.log('Wrong password! Try again...')
  } while (vault === null)

  console.clear()
  vaultState = VaultState.UNLOCKED

  while (vaultState === VaultState.UNLOCKED) {
    if (idleTimeoutId) clearTimeout(idleTimeoutId)

    idleTimeoutId = setTimeout(() => {
      vault = null
      vaultState = VaultState.LOCKED
      console.log(`\nIdle for ${IDLE_SECONDS} seconds... closing vault.\n`)
      console.log(`Bye!!!`)
      process.exit(0)
    }, IDLE_SECONDS * 1000)

    const mainMenu = await inquirer.prompt({
      type: 'list',
      name: 'option',
      message: 'Choose what you want to do:',
      choices: [
        {
          name: 'Copy the secret of a credential to clipboard',
          value: 'copySecretClipboard',
        },
        {
          name: 'List all my credentials (obfuscated)',
          value: 'listCredentials',
        },
        {
          name: 'Store a new credential',
          value: 'storeCredential',
        },
        {
          name: 'Generate a strong password',
          value: 'generateStrongPassword',
        },
        {
          name: '[!!] Show the plain secret for a single credential',
          value: 'showCredential',
        },
        {
          name: '[!!] Show the last generated password',
          value: 'showLastGeneratedPassword',
        },
        {
          name: 'Exit...',
          value: 'exit',
        },
      ],
    })

    if (mainMenu.option === 'listCredentials' && vault) {
      console.clear()
      if (!vault?.credentials.length) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else
        console.table(vault?.credentials.map((credential) => ({ ...credential, secret: '******' })))
    }

    if (mainMenu.option === 'storeCredential' && vault) {
      console.clear()
      const credentialData = await inquirer.prompt([
        {
          type: 'input',
          name: 'identifier',
          message: 'Provide an identifier for this credential (eg: amazon):',
          validate(input: string): boolean | string {
            if (input.length < 2) return 'You must provide an identifier for this credential'
            if (vault?.credentials.some((credential) => credential.key === input))
              return 'A credential with this same identifier already exists! Choose other...'
            return true
          },
        },
        {
          type: 'input',
          name: 'key',
          message: 'Provide a key for your credential (usually a login):',
        },
        {
          type: 'password',
          mask: '*',
          name: 'secret',
          message: 'Provide a secret value for this credential:',
          validate(input: string): boolean | string | Promise<boolean | string> {
            if (input.length === 0) return 'You must provide a secret value'
            return true
          },
        },
        {
          type: 'password',
          mask: '*',
          name: 'confirmation',
          message: 'Provide the same secret again:',
          validate(input: string, answers: Record<string, string>): boolean | string {
            if (input !== answers.secret)
              return 'The password doest not match the provided password'
            return true
          },
        },
        {
          type: 'input',
          name: 'website',
          message: 'Provide a website for this credential (optional):',
        },
      ])
      vault.credentials.push({
        identifier: credentialData.identifier,
        key: credentialData.key,
        secret: credentialData.secret,
        website: credentialData.website,
      })
      updateVault(vault, vaultPasswordHash)
      console.clear()
      console.log('Your credential was stored successfully!')
    }

    if (mainMenu.option === 'copySecretClipboard' && vault) {
      console.clear()
      if (vault.credentials.length === 0) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else {
        const credentialData = await inquirer.prompt({
          type: vault.credentials.length > 5 ? 'rawlist' : 'list',
          name: 'index',
          message: 'Select a credential to copy the secret to the clipboard:',
          choices: vault.credentials.map((credential, index) => ({
            name: `Identifier: ${credential.identifier} | Key: ${credential.key} | Website: ${credential.website}`,
            value: index,
          })),
        })

        const credential = vault.credentials[parseInt(credentialData.index, 10)]
        clipboardy.writeSync(credential.secret)

        await inquirer.prompt({
          type: 'input',
          name: 'confirmation',
          message: 'Credential copied to clipboard! Press enter to main menu...',
        })
        console.clear()
      }
    }

    if (mainMenu.option === 'showCredential' && vault) {
      console.clear()
      if (vault.credentials.length === 0) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else {
        const credentialData = await inquirer.prompt({
          type: vault.credentials.length > 5 ? 'rawlist' : 'list',
          name: 'index',
          message: 'Select a credential to show the secret:',
          choices: vault.credentials.map((credential, index) => ({
            name: `Identifier: ${credential.identifier} - Key: ${credential.key} - Website: ${credential.website}`,
            value: index,
          })),
        })

        const credential = vault.credentials[parseInt(credentialData.index, 10)]
        console.table(credential)

        await inquirer.prompt({
          type: 'input',
          name: 'confirmation',
          message: 'Press enter to hide and back to main menu...',
        })
        console.clear()
      }
    }

    if (mainMenu.option === 'generateStrongPassword' && vault) {
      const credentialData = await inquirer.prompt([
        {
          type: 'number',
          name: 'size',
          default: 18,
          message: 'What is the desired size?',
        },
        {
          type: 'confirm',
          name: 'specialChars',
          default: true,
          message: 'Should we add some special chars?',
        },
        {
          type: 'input',
          name: 'exclude',
          default: '',
          message: 'Type any characters you want to exclude',
        },
      ])

      lastGeneratedPassword = generateStrongPassword({
        size: credentialData.size,
        specialChars: credentialData.specialChars,
        exclude: credentialData.exclude,
      })
      clipboardy.writeSync(lastGeneratedPassword)
      const confirmDisplay = await inquirer.prompt({
        type: 'confirm',
        default: false,
        name: 'display',
        message: 'Password generated and copied to clipboard! Should we display it?',
      })
      if (confirmDisplay.display) {
        console.log('------ generated password ------ ')
        console.log(lastGeneratedPassword)
        console.log('------ generated password ------ ')
        await inquirer.prompt({
          type: 'input',
          name: 'continue',
          message: 'Press enter to go back to the main menu...',
        })
      }
      console.clear()
    }

    if (mainMenu.option === 'showLastGeneratedPassword' && vault) {
      if (!lastGeneratedPassword) {
        console.log('There were no passwords generated for this session!')
      } else {
        console.log('------ generated password ------ ')
        console.log(lastGeneratedPassword)
        console.log('------ generated password ------ ')
      }
      await inquirer.prompt({
        type: 'input',
        name: 'continue',
        message: 'Press enter to hide and back to main menu...',
      })
      console.clear()
    }

    if (mainMenu.option === 'exit') {
      console.log('Bye!!!')
      process.exit(0)
    }
  }

  return main()
}

main()
