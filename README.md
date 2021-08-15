# node-passvault

A lightweight credentials vault created with node.

It stores the credentials using `aes-256-gcm`, with a key formed from a `pbdk2` based on a `sha256` of the user's plain key.

To build the program, simply run `yarn build` or `npm run build`. An executable file will be created on `/build`. It requires node `14.*` to be installed to run.

License: MIT.
