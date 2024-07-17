# Kashimo
A Minecraft farming bot named after the GOAT of the farmer era: [Hajime Kashimo](https://jujutsu-kaisen.fandom.com/wiki/Hajime_Kashimo)

Planting and replanting is functional. However, crops are only detected via block updates.

## Usage Instructions
1. Install [Node.js + NPM](https://nodejs.org/en/download/package-manager) if needed
2. Open your world to LAN on port 59001 
3. Run `npm install` (on first use)
4. Run `npm start`
> This bot is very rudimentary right now. Configuration options will be available in the future.

## TODO
- [x] Use entity despawn events instead of arbitrary windows for item collection
- [x] Stop item collection if inventory is full
- [ ] Implement failsafe for unreachable item drops/blocks
- [ ] Auto-detect adjacent crops
- [ ] Asynchronously search for crops
- [ ] Storage...
