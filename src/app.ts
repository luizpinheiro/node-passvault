import inquirer from 'inquirer'
import { clearTimeout } from 'timers'
import clipboardy from 'clipboardy'

import { MainMenuOptions, VaultState } from './enums'
import * as vault from './modules/vault'
import { MenuOptionsHandler } from './types'

const IDLE_SECONDS = 60
let vaultState = VaultState.LOCKED
let idleTimeoutId: NodeJS.Timeout | null = null
let lastGeneratedPassword: string | null = null

const main = async (): Promise<void> => {
  console.clear()

  /**
   * If not vault exists (eg: program is running for the first time),
   * creates a new one
   */
  if (!vault.vaultExists()) {
    await interactivelyCreateVault()
  }

  /**
   * At this point a vault certainly exists.
   * Try to unlock it.
   */
  do {
    await unlockVault()
  } while (vault.locked())

  /**
   * Starts the main menu loop
   */
  console.clear()
  vaultState = VaultState.UNLOCKED

  while (vaultState === VaultState.UNLOCKED) {
    if (idleTimeoutId) clearTimeout(idleTimeoutId)

    /**
     * Sets a timer to handle automatic lock after IDLE_SECONDS
     */
    idleTimeoutId = setTimeout(() => {
      vault.lockVault()
      console.log(`\nIdle for ${IDLE_SECONDS} seconds... closing vault.\n`)
      console.log(`Bye!!!`)
      process.exit(0)
    }, IDLE_SECONDS * 1000)

    const menuSelection = await inquirer.prompt({
      type: 'list',
      name: 'option',
      message: 'Choose what you want to do:',
      loop: false,
      pageSize: 20,
      choices: [
        {
          name: 'Copy the secret of a credential to clipboard',
          value: MainMenuOptions.COPY_SECRET_CLIPBOARD,
        },
        {
          name: 'List all my credentials (obfuscated)',
          value: MainMenuOptions.LIST_CREDENTIALS,
        },
        {
          name: 'Store a new credential',
          value: MainMenuOptions.STORE_CREDENTIAL,
        },
        {
          name: 'Remove a credential',
          value: MainMenuOptions.REMOVE_CREDENTIAL,
        },
        {
          name: 'Generate a strong password',
          value: MainMenuOptions.GENERATE_PASSWORD,
        },
        new inquirer.Separator(),
        {
          name: '[!!] Show the plain secret for a single credential',
          value: MainMenuOptions.SHOW_CREDENTIAL,
        },
        {
          name: '[!!] Show the last generated password',
          value: MainMenuOptions.SHOW_LAST_GENERATED_PASSWORD,
        },
        new inquirer.Separator(),
        {
          name: 'Backup your vault file',
          value: MainMenuOptions.BACKUP_VAULT,
        },
        {
          name: 'Change vault master password',
          value: MainMenuOptions.UPDATE_VAULT_PASSWORD,
        },
        {
          name: 'Exit',
          value: MainMenuOptions.EXIT,
        },
      ],
    })
    /**
     * Invoke the appropriate menu handler
     */
    await menuHandler[menuSelection.option as MainMenuOptions]()
  }
}

/**
 * Creates a new vault for the user, asking for a master password
 */
const interactivelyCreateVault = async () => {
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
}

/**
 * Tries to unlock the vault by asking the user
 * for the master password
 */
const unlockVault = async () => {
  const inputPassword = await inquirer.prompt({
    type: 'password',
    name: 'password',
    message: 'Provide the master password of your vault:',
  })
  if (!vault.unlockVault(inputPassword.password)) console.log('Wrong password! Try again...')
}

/**
 * Create a object containing all of the menu handlers
 */
const menuHandler: MenuOptionsHandler = {
  [MainMenuOptions.EXIT]: async (): Promise<void> => {
    console.log('Bye!!!')
    process.exit(0)
  },
  [MainMenuOptions.LIST_CREDENTIALS]: async (): Promise<void> => {
    console.clear()
    const credentials = vault.getCredentials()
    if (!credentials.length) {
      logNoCredentialsMessage()
      return
    }
    console.table(credentials.map((credential) => ({ ...credential, secret: '******' })))
    await showBackToMainMenuOption()
    console.clear()
  },
  [MainMenuOptions.STORE_CREDENTIAL]: async (): Promise<void> => {
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
          if (input !== answers.secret) return 'The password doest not match the provided password'
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
    console.log('Done! Your new credential was stored successfully!')
    await showBackToMainMenuOption()
    console.clear()
  },
  [MainMenuOptions.COPY_SECRET_CLIPBOARD]: async (): Promise<void> => {
    console.clear()
    const credentials = vault.getCredentials()
    if (credentials.length === 0) {
      logNoCredentialsMessage()
    }
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
      console.log('Credential copied to clipboard!')
      await showBackToMainMenuOption()
    }
    console.clear()
  },
  [MainMenuOptions.SHOW_CREDENTIAL]: async (): Promise<void> => {
    console.clear()
    const credentials = vault.getCredentials()
    if (credentials.length === 0) {
      logNoCredentialsMessage()
    }
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
      await showBackToMainMenuOption()
    }
    console.clear()
  },
  [MainMenuOptions.REMOVE_CREDENTIAL]: async (): Promise<void> => {
    console.clear()
    const credentials = vault.getCredentials()
    if (credentials.length === 0) {
      logNoCredentialsMessage()
      return
    }

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
        await showBackToMainMenuOption()
      }
    }
    console.clear()
  },
  [MainMenuOptions.GENERATE_PASSWORD]: async (): Promise<void> => {
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
      await showBackToMainMenuOption()
    }
    console.clear()
  },
  [MainMenuOptions.SHOW_LAST_GENERATED_PASSWORD]: async (): Promise<void> => {
    if (!lastGeneratedPassword) {
      console.log('There were no passwords generated for this session!')
    } else {
      console.log('------ generated password ------ ')
      console.log(lastGeneratedPassword)
      console.log('------ generated password ------ ')
    }
    await showBackToMainMenuOption()
    console.clear()
  },
  [MainMenuOptions.UPDATE_VAULT_PASSWORD]: async (): Promise<void> => {
    console.clear()
    const data = await inquirer.prompt([
      {
        type: 'password',
        name: 'currentPassword',
        message: 'Provide your CURRENT vault password (leave empty to abort):',
        validate(input: string): string | boolean {
          if (input.length > 0 && !vault.checkCurrentPassword(input)) {
            return 'Invalid current password'
          }
          return true
        },
      },
      {
        type: 'password',
        name: 'newPassword',
        message: 'Provide a NEW vault password (leave empty to abort):',
        when: (answers: Record<string, string>): boolean => !!answers.currentPassword,
        validate(input: string): boolean | string {
          if (input.length > 0 && !vault.validateStrongPassword(input)) {
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
        when: (answers: Record<string, string>): boolean => !!answers.newPassword,
        message: 'Confirm the NEW vault password (leave empty to abort):',
        validate(input: string, answers?: Record<string, string>): boolean | string {
          if (input.length > 0 && input !== answers?.newPassword) {
            return 'The confirmation does not match the provided password.'
          }
          return true
        },
      },
    ])
    if (!data.currentPassword || !data.newPassword || !data.confirmation) {
      console.log('Aborted!')
    } else {
      console.log('Updating vault password...')
      vault.changePassword(data.newPassword)
      console.log('Vault password successfully updated!')
    }

    await showBackToMainMenuOption()
    console.clear()
  },
  [MainMenuOptions.BACKUP_VAULT]: async (): Promise<void> => {
    console.log('Backing up your vault...')
    vault.backupVault()
    console.log('Done!')
    await showBackToMainMenuOption()
    console.clear()
  },
}

const logNoCredentialsMessage = (): void => {
  console.log('-------------------------------------')
  console.log("You don't have any stored credentials!")
  console.log('-------------------------------------')
}

const showBackToMainMenuOption = async (): Promise<void> => {
  await inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: 'Press enter to main menu...',
  })
}

/**
 * Finally starts the program!
 */
main()
