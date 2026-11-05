# Security

## Certificate pinning (Android)

`plugins/withCertificatePinning.js` writes
`android/app/src/main/res/xml/network_security_config.xml` and sets
`android:networkSecurityConfig` on the `<application>` element. The pins are
SHA-256 SPKI hashes of the live certificate chain for:

- `api.telegram.org` (leaf + Go Daddy intermediate + Go Daddy root)
- `api.github.com` (leaf + Sectigo intermediate + Sectigo root + USERTrust
  backup root)

Any certificate in the chain matching one pin keeps the connection alive, so a
routine leaf renewal under the same intermediate/root does not break the app.

### Rotating a pin

1. Inspect the new chain:

   ```bash
   node -e "const tls=require('tls'),c=require('crypto');const s=tls.connect({host:'api.telegram.org',port:443,servername:'api.telegram.org'},()=>{let x=s.getPeerCertificate(true);while(x&&x.raw){console.log(x.subject.CN,c.createHash('sha256').update(x.pubkey).digest('base64'));x=x.issuerCertificate;}s.end();})"
   ```

2. Update the array in `plugins/withCertificatePinning.js`.
3. Regenerate the committed file (copy the plugin output or run
   `npx expo prebuild -p android` in a scratch worktree) and commit both.
4. Rebuild the APK — pinning is applied by Android before JavaScript runs.

Pinning is intentionally static; there is no runtime toggle. A wrong pin fails
closed for the pinned hosts only (release downloads on
`objects.githubusercontent.com` are not pinned).
