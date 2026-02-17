# Consent Statement v1

This file is the canonical consent text for policy version `legal-consent-v1`.

Recommended implementation:

- Keep this text stable once published.
- Compute `tos_hash` from the terms document.
- Compute `statement_hash` from this file's exact UTF-8 bytes.
- Include both hashes in every legal signature challenge.

## Statement text

By signing this message, I confirm:

- I control this wallet address.
- I understand I am responsible for inscriptions and contract actions initiated with this wallet.
- I will not upload or publish unlawful, infringing, malicious, or unauthorized content.
- I understand Xtrata is a neutral protocol and does not curate content.
- I understand blockchain transactions are irreversible.
- I understand inscription data cannot be modified once written.
- I understand Xtrata does not custody my assets or keys.

## Scope text

If signature scopes include `public-mint`, also show:

- This consent applies to public minting flows using Xtrata-linked contracts.

If signature scopes include `collection-deploy`, also show:

- This consent applies to deploying collection-mint contracts through the Xtrata manage flow.
