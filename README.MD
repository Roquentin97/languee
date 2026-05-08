Languee App

## Bruno

The backend API has a Bruno collection at `apps/languee-back/bruno`.

To use it in the Bruno desktop app, import or open that folder as a
collection, then select the `Local` environment.

To run it with the Bruno CLI:

```bash
cd apps/languee-back/bruno
bru run --env Local
```

Run `Register` or `Login` first when using protected requests. `Login` and
`Refresh Token` capture `accessToken` as a Bruno runtime variable for the
session-related endpoints.
