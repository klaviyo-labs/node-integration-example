# Klaviyo Node Example Integration

An express app to show the basics of making an OAuth integration with Klaviyo.

## Introduction 

Klaviyo's new OAuth feature improves the developer experience for users who need to make API calls from multiple Klaviyo accounts.
This app demonstrates how to get started coding an OAuth integration using the [Beta Klaviyo Node SDK](https://github.com/klaviyo/klaviyo-api-node/tree/oauth-beta).

## Before you begin
 - Check out our [guides to integrating with Klaviyo](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration).
 - See how our [Klaviyo Node SDK](https://github.com/klaviyo/klaviyo-api-node/tree/oauth-beta) makes this process easier.

## App tools
 -  [Express JS](https://expressjs.com/)
    <br><br>
    Minimal Node.js web app framework used for building a web server
    <br><br>
 - [Prism](https://www.prisma.io/)
    <br><br>
    Typescript ORM used for connecting a SQLite database to store `refresh` and `access` tokens.
    <br><br>
    Note that there is no "correct" way to store these tokens, only some best practices.
    For example, [Redis](https://redis.io/) is another tool you could use to manage your user's authentication in the Klaviyo environment.
    <br><br>
 - [Klaviyo Node SDK](https://github.com/klaviyo/klaviyo-api-node/tree/oauth-beta)
    <br><bR>
    Klaviyo’s Node SDK is used for abstracting the `access token` retry and refresh process, and making API calls to Klaviyo.

## App Structure

This backend application has 2 Typescript files:

 1. [`storageHelpers.ts`](./storageHelpers.ts)
    <br><br>
    Outlines 2 helper classes:
    <br><br>
    - [`PrismaTokenStorage`](#prismatokenstorage)
    <br><br>
    Enables you to connect to a data source of your choice and allows the `klaviyo-sdk` to keep your `access token` up to date.
    <br><br>
    - [`PrismaPkceStorage`](#prismapkcestorage)
    <br><br>
    If you are unfamiliar with Proof Key of Code Exchange (PKCE), read the [Klaviyo PKCE guide](https://help.klaviyo.com/hc/en-us/articles/18819413031067#h_01HACEKGF3AZ2KFGVPSSZNR5QW).
    <br><br>
    
 2. [`index.ts`](./index.ts)
    <br><br>
    Defines endpoints and initializes the web framework and database connection.
    Endpoints include:
    <br><br>

    - [`/start/:customerIdentifier`](#startcustomeridentifier)
    <br><br>
    The entry point for a Klaviyo user wanting to authorize your integration.
    For example, after a user signs up on your website, you would redirect to this URL from an "install Klaviyo integration" button.
    <br><br>
    
    - [`/authorize`](#authorize)
    <br><br>
    The `redirectUrl` sent to Klaviyo in the endpoint above.
    When a user authorizes your integration, this endpoint takes the passed-in code to create `refresh` and `access` tokens.
    <br><br>
    
    - [`/profiles/:customerIdentifier`](#profilescustomeridentifier)
    <br><br>
    Makes a `getProfiles` API call for the passed-in customer identifier's corresponding user.
    From here on out, the Klaviyo SDK will keep your `access token` up to date.

## Helper classes

### `PrismaTokenStorage`
How it works

1. The `Constructor` class saves a reference to the `PrismaClient`, which holds the database connection for later use.
2. After creating a new `access token` (via the authorization flow or access token refresh flow), the save method is called and the code `UPSERTS` the new `access` or `refresh` token information into the database.
3. The `retrieve` method leverages `customerIdentifier` to retrieve the saved token information and return it for the `OAuthApi` object to use.


Important variables
 - `accessToken`
    <br><br>
    The short-lived token required to make API calls. If a falsy value for the `access token` is returned by `retrieve`,
    the `OAuthApiSession` instance will refresh the `access token` before making an API call.
    <br><br>

 - `refreshToken`
    <br><br> 
    The only required variable.
    If this value is invalid, then you will get a `REFRESH_TOKEN_ERROR` when an `access token` is refreshed.
    <br><br>

 - `expiresAt` 
    <br><br>
    The calculated value derived from the current system’s date and time and the `expires_in` time the Klaviyo `/token` API returns.
    <br><br>
    - If `expiresAt` is saved and returned, 
    the SDK will refresh your access token if it has expired or will expire in less than 60 seconds.
    - If `expiresAt` is not returned,
    the API will refresh the token, but only after your API call fails with a 401 error. This means there will be 1 more API call, which may affect the time to receive a valid response.

Considerations

 - The `klaviyo-api` package relies on your implementation of `TokenStorage` to define the `save` and `retrieve` calls for loading your `access` and `refresh` tokens into API calls.
Later, the `OAuthApi` object will use an instance of this storage for that purpose.
<br><br>
 - This implementation uses the built-in `node:crypto` library to encrypt `Access Tokens`. Always use encryption when saving sensitive information.

### `PrismaPkceStorage`

How it works

 1. The `Constructor` class saves a reference to the `PrismaClient`, which holds the database connection for later use.
 2. The `save` method is the same as PrismaTokenStorage. We `UPSERT` the `PKCE` codes into the database to be referenced later.
    Remember to save your codes before redirecting the user to verify the integration.
 3. The `retrieve` method uses the `customerIdentifier` you sent as the `state` query parameter for the authorization redirect to look up the `codeVerifier` for the given user. 
 4. After the user has successfully authorized your integration, the `remove` method is called. Since the PKCE codes are no longer needed, they are deleted from storage.


Considerations

 - After redirecting a user to authorize your integration, `PrismaPkceStorage` helps in keeping a reference to the `codeVerifier` associated with the `codeChallenge`.
 - `PkceCodeStorage` is an optional helper to keep your authorization flow code similar to the refresh flow.
 - Authorization flow can also be almost completely handled via front end and session variables.
 - The correct code verifier is required when creating the first `access` and `refresh` tokens to ensure that a third party isn't attempting to create these on your behalf.

## Endpoints

### `/start/:customerIdentifier`

How it works

 1. A Proof Key of Code Exchange (PKCE) is generated and saved:
    1. The `codeVerifier` is sent at the start of the authorization flow.
    2. The `codeChallenge` is sent at the end of the authorization flow to generate a `refresh` and `access` token.
 
2. A redirect to the Klaviyo authorization webpage for your integration occurs. The `generateAuthorizeUrl` helper exposed by an initialized `OAuthApi` helps correctly format the Klaviyo authorized URL. This method takes four parameters:
    <br><br>

    1. `state`
        <br><br>
        The only way to identify which user just authorized (or failed to authorize) your application. Passed back via query parameter to your `redirectUrl`.
        <br><br>
    2. `scope`
        <br><br>
        The permissions the created `access tokens` will have, displayed to the user during the authorization flow. For these permissions to work, add them to your [integration settings](www.klaviyo.com/oauth/client) in Klaviyo.
        <br><br>
    3. `codeChallenge`
        <br><br>
        The value generated above by the `generateCode` function.
        <br><br>
   4. `redirectUrl`
        <br><br>
        The URL that Klaviyo will redirect the user to once authorization is completed (even if it is denied or has an error). Remember to whitelist this redirect URL in your integration settings.
        <br><br>
   
Important variables
 - `customerIdentifier`
    <br><br>
    Refers to how you will identify the Klaviyo users authorizing your integration and identifies which user has approved your integration. This `customerIdentifier` is passed as the `state` value in `generateAuthorizeUrl`.

### `/authorize`

How it works

 1. The app searches for the saved `codeVerifier`, which is fetched by the implementation of `PkceCodeStorage`.
    It uses the `state` query parameter, which was set during the redirect step in the previous endpoint, to be our customer's unique identifier.
 2. `OAuthApi`'s second helper method, `createTokens`, is used to finish the authorization flow and create your `access` and `refresh` token.
 3. If the user approves your integration, the `authorizationCode`, i.e., `code` query parameter, is supplied.
 4. The now unneeded PKCE codes are removed.

Important Variables

 - `customerIdentifier` 
    <br><br>
    Defined in the previous endpoint description. This ID is not sent to Klaviyo.
    <br><br> 
 - `codeVerifier`
    <br><br>
    The `codeVerifier` retrieved in step 1 above.
    <br><br>
 - `authorizationCode`
    <br><br>
    The `code` query parameter (read step 3) supplied when the user approves your integration.
    <br><br>
 - `redirectUrl`
    <br><br>
    The endpoints' path. It must match the one passed during the `/start/`'s redirect and whitelisted in your application settings.


Considerations

 - If the `/token` API call this method wraps is successful, the created tokens will be passed into your `save` method along with this `customerIdentifier` in your implementation of `TokenStorage`.
 - You can create an instance of `OAuthSession` for the approved integration and start making API calls. Check out the following endpoint to see what that looks like.

### `/profiles/:customerIdentifier`

How it works

 1. An `OAuthSession` instance is created. The `CustomerIdentifier` lets the SDK communicate `TokenService` to get the stored `accessToken` to make the API call or the `refreshToken` if the token is expired.
 2. A `ProfilesAPI` instance is created, which is loaded with the session information.
 3. A GET call to `/profiles` is made and any necessary` accessToken` refreshes are handled.

# Running the Sample App

### First Time Setup

#### Use the correct node version
```bash
nvm use
```
or if you don't use `nvm` install Node version `18` or later

#### Configuring your environment variables
```bash
# creating an environment file
cp .env-sample .env
```
Add your integration client id and secret to the `.env` file, retrieved from your integration settings [here](https://www.klaviyo.com/oauth/client)

Generate a `KEY` value to use to encrypt your `access tokens`

You can use
```bash
 node -e "const c = require('node:crypto'); console.log(c.randomBytes(32).toString('hex'))"
```
to generate a 32 byte key

#### Installing dependencies and initialization of your database
```bash
# install dependencies  
npm i
# initialize database from schema.prisma
npx prisma migrate dev --name init
# compile the typescript
npm run build
```
### Running the app
```bash
# run the server
npm start
```

## Using the app

Note: port defaults to 8000 but can be changed in the `.env` file.

### Authenticating a new user

In the browser go to `localhost:8000/start/:customerIdentifer` - For testing purposes you can use any string as your test ID.

This will create OAuth info that is associated with this user ID

### Testing an Authenticated User

Once setup is completed test a call with `localhost:8000/profiles/:customerIdentifier` to try a get profiles api call for the provided user.

### Uninstalling the app

To uninstall your app, go to `localhost:8000/uninstall/:customerIdentifier`. This will send the refreshToken to the revoke endpoint and uninstall the app. After uninstalling, you will no longer see it listed as an active integration in Klaviyo.

