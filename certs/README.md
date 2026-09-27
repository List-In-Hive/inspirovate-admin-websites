# Supabase production root CA

Downloaded over HTTPS from the URL published by Supabase Studio:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Source: https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json (`ssl:certificate_url`).
SHA-256: 807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA
Expires: 2031-04-26.

Public certificate, not a secret. Added only to the database TLS configuration for Supabase hosts. Certificate and hostname verification remain enabled. System/global trust is unchanged.
