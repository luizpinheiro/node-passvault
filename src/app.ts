import inquirer from 'inquirer'
import { clearTimeout } from 'timers'
import clipboardy from 'clipboardy'

import { VaultState } from './enums'
import * as vault from './modules/vault'

const IDLE_SECONDS = 60
let vaultState = VaultState.LOCKED
let idleTimeoutId: NodeJS.Timeout | null = null
let lastGeneratedPassword: string | null = null

const main = async (): Promise<void> => {
  if (!vault.vaultExists()) {
    console.log('---- NO VAULT FOUND, CREATING... ---')
    let passwordData
    let weakPass
    do {
      passwordData = await inquirer.prompt([
        {
          type: 'password',
          name: 'plain',
          message: 'Provide a master password for your NEW vault:',
          validate(plainPassword: string): boolean | string {
            if (!vault.validateStrongPassword(plainPassword))
              return 'Your password is too weak!\nIt MUST be at least 12 chars long and have upper and lower case letters, numbers and special chars. You also SHOULD NOT use the password you choose anywhere else!'
            return true
          },
        },
        {
          type: 'password',
          name: 'confirmation',
          message: 'Type it again so we can be sure you made no mistakes:',
        },
      ])

      if (passwordData.plain !== passwordData.confirmation)
        console.log('Provided passwords does not match!')
    } while (weakPass || passwordData.plain !== passwordData.confirmation)

    vault.createVault(passwordData.plain)
    console.log('Great! We have created your vault!!!')
    return main()
  }

  do {
    const inputPassword = await inquirer.prompt({
      type: 'password',
      name: 'password',
      message: 'Provide the master password of your vault:',
    })
    if (!vault.unlockVault(inputPassword.password)) console.log('Wrong password! Try again...')
  } while (vault.locked())

  console.clear()
  vaultState = VaultState.UNLOCKED

  while (vaultState === VaultState.UNLOCKED) {
    if (idleTimeoutId) clearTimeout(idleTimeoutId)

    idleTimeoutId = setTimeout(() => {
      vault.lockVault()
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
          name: 'Remove a credential',
          value: 'removeCredential',
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
          name: 'Change vault master password',
          value: 'changeVaultMasterPassword',
        },
        {
          name: 'Exit',
          value: 'exit',
        },
      ],
    })

    if (mainMenu.option === 'listCredentials' && vault) {
      console.clear()
      const credentials = vault.getCredentials()
      if (!credentials.length) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else console.table(credentials.map((credential) => ({ ...credential, secret: '******' })))
    }

    if (mainMenu.option === 'storeCredential' && vault) {
      console.clear()
      const credentials = vault.getCredentials()
      const credentialData = await inquirer.prompt([
        {
          type: 'input',
          name: 'identifier',
          message: 'Provide an identifier for this credential (eg: amazon):',
          validate(input: string): boolean | string {
            if (input.length < 2) return 'You must provide an identifier for this credential'
            if (credentials.some((credential) => credential.key === input))
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
      vault.addCredential({
        identifier: credentialData.identifier,
        key: credentialData.key,
        secret: credentialData.secret,
        website: credentialData.website,
      })
      console.clear()
      console.log('Your credential was stored successfully!')
    }

    if (mainMenu.option === 'copySecretClipboard' && vault) {
      console.clear()
      const credentials = vault.getCredentials()
      if (credentials.length === 0) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else {
        const credentialData = await inquirer.prompt({
          type: credentials.length > 5 ? 'rawlist' : 'list',
          name: 'index',
          message: 'Select a credential to copy the secret to the clipboard:',
          choices: [
            ...credentials.map((credential, index) => ({
              name: `Identifier: ${credential.identifier} | Key: ${credential.key} | Website: ${credential.website}`,
              value: index,
            })),
            {
              name: 'Abort...',
              value: -1,
            },
          ],
        })
        const index = parseInt(credentialData.index, 10)
        if (index >= 0) {
          const credential = credentials[index]
          clipboardy.writeSync(credential.secret)
          await inquirer.prompt({
            type: 'input',
            name: 'confirmation',
            message: 'Credential copied to clipboard! Press enter to main menu...',
          })
        }
        console.clear()
      }
    }

    if (mainMenu.option === 'showCredential' && vault) {
      console.clear()
      const credentials = vault.getCredentials()
      if (credentials.length === 0) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else {
        const credentialData = await inquirer.prompt({
          type: credentials.length > 5 ? 'rawlist' : 'list',
          name: 'index',
          message: 'Select a credential to show the secret:',
          choices: [
            ...credentials.map((credential, index) => ({
              name: `Identifier: ${credential.identifier} - Key: ${credential.key} - Website: ${credential.website}`,
              value: index,
            })),
            {
              name: 'Abort...',
              value: -1,
            },
          ],
        })
        const index = parseInt(credentialData.index, 10)
        if (index >= 0) {
          const credential = credentials[index]
          console.table(credential)

          await inquirer.prompt({
            type: 'input',
            name: 'confirmation',
            message: 'Press enter to hide and back to main menu...',
          })
        }
        console.clear()
      }
    }

    if (mainMenu.option === 'removeCredential' && vault) {
      console.clear()
      const credentials = vault.getCredentials()
      if (credentials.length === 0) {
        console.log('-------------------------------------')
        console.log("You don't have any store credentials!")
        console.log('-------------------------------------')
      } else {
        const credentialData = await inquirer.prompt({
          type: credentials.length > 5 ? 'rawlist' : 'list',
          name: 'index',
          message: 'Select the credential you want to remove:',
          choices: [
            ...credentials.map((credential, index) => ({
              name: `Identifier: ${credential.identifier} | Key: ${credential.key} | Website: ${credential.website}`,
              value: index,
            })),
            {
              name: 'Abort...',
              value: -1,
            },
          ],
        })

        const index = parseInt(credentialData.index, 10)
        if (index >= 0) {
          const credential = credentials[index]
          const confirmation = await inquirer.prompt({
            type: 'confirm',
            name: 'confirm',
            default: false,
            message: `Are you sure you want to remove the credential "${credential.identifier}"? This cannot be undone!`,
          })
          if (confirmation.confirm) {
            vault.removeCredential(credential)
            console.log('Credential removed successfully!')
            await inquirer.prompt({
              type: 'input',
              name: 'confirmation',
              message: 'Press enter to hide and back to main menu...',
            })
          }
        }
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

      lastGeneratedPassword = vault.generateStrongPassword({
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

    if (mainMenu.option === 'changeVaultMasterPassword') {
      console.clear()
      const data = await inquirer.prompt([
        {
          type: 'password',
          name: 'currentPassword',
          message: 'Provide your CURRENT vault password:',
          validate(input: string): string | boolean {
            if (!vault.checkCurrentPassword(input)) {
              return 'Invalid current password'
            }
            return true
          },
        },
        {
          type: 'password',
          name: 'newPassword',
          message: 'Provide a NEW vault password:',
          validate(input: string): boolean | string {
            if (!vault.validateStrongPassword(input)) {
              return 'The new password is not valid. It must have at least 12 characters and contain upper and lower case letters, numbers and special chars.'
            }
            if (vault.checkCurrentPassword(input)) {
              return 'The new password cannot be the same as the current password.'
            }
            return true
          },
        },
        {
          type: 'password',
          name: 'confirmation',
          message: 'Confirm the NEW vault password:',
          validate(input: string, answers?: Record<string, string>): boolean | string {
            if (input !== answers?.newPassword) {
              return 'The confirmation does not match the provided password.'
            }
            return true
          },
        },
      ])
      console.log('Updating vault password...')
      console.log('Vault password successfully updated!')
      vault.changePassword(data.newPassword)
      await inquirer.prompt({
        type: 'input',
        name: 'continue',
        message: 'Press enter to main menu...',
      })
    }

    if (mainMenu.option === 'exit') {
      console.log('Bye!!!')
      process.exit(0)
    }
  }

  return main()
}

main()
