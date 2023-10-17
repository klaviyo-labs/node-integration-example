import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';

import {
    OAuthApi,
    OAuthCallbackQueryParams,
    OAuthSession,
    Pkce,
    ProfilesApi,
    TokenStorage,
} from 'klaviyo-api'

import { PrismaClient } from '@prisma/client'

import {PrismaTokenStorage, PrismPkceStorage} from "./storageHelpers";

// reads the .env file
dotenv.config();

const app: Express = express();
const port = process.env.PORT;
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  throw Error("Set client_id and client_secret in .env file")
}
if (!process.env.KEY ) {
  throw Error("Generate a key and set it in the .env file")
}

// This is where the user will be redirected back to once they approve your integration.
// This route should at least create an access and refresh token for an authorized user
const appRedirectUrl = `http://localhost:${port}/authorize`

// initialization of our database connection
const prisma = new PrismaClient()

const tokenStorage: TokenStorage = new PrismaTokenStorage(prisma, process.env.KEY)
// This PKCE storage is by no means required we just provide an interface to help keep your code organized.
// You can also do the start authorization from your frontend
// An alternative is to keep the code variable in a session variable
const pkceStorage: PrismPkceStorage = new PrismPkceStorage(prisma)

// configure the OAuth api with your integration information and how you are going to save/retrieve access/refresh tokens
const oauthApi = new OAuthApi(process.env.CLIENT_ID, process.env.CLIENT_SECRET, tokenStorage)

// The first endpoint that serves as the start of the author
app.get('/start/:customerIdentifier', async (req: Request, res: Response) => {

  const pkceCodes: Pkce.Codes = Pkce.generateCodes()
  await pkceStorage.save(req.params.customerIdentifier, pkceCodes.codeVerifier)
  // redirects the user to Klaviyo to approve the integration
  res.redirect(
    // helper method to format the authorize url
    oauthApi.generateAuthorizeUrl(
      // This is the only way to identify which user just authorized your application (or failed to). `state` is passed back via query parameter to your `redirectUrl`
      req.params.customerIdentifier,
      // The scopes, aka the allowed permissions of the created key. Ensure these permissions are whitelisted in your integration settings
      "accounts:read campaigns:read campaigns:write catalogs:read catalogs:write coupon-codes:read coupon-codes:write coupons:read coupons:write data-privacy:write events:read events:write flows:read flows:write images:read images:write list:read list:write metrics:read profiles:read profiles:write push-tokens:write segments:read segments:write subscriptions:write tags:read tags:write template:write templates:read",
      // This is the value generated above
      pkceCodes.codeChallenge,
      // This is the URL that Klaviyo will redirect the user to once Authorization is completed (even if it is denied or has an error).
      // Remember to whitelist this redirect URL in your integration's settings in Klaviyo.
      appRedirectUrl
    )
  )

});

// This endpoint is redirected to by Klaviyo after a user approves or denies your integration
app.get('/authorize', async (req: Request, res: Response) => {
  const callbackInfo: OAuthCallbackQueryParams = req.query
  // if code is not provided that means an error occurred.
  // state should always be returned but check anyway
  if (callbackInfo.code && callbackInfo.state) {
    let codeVerifier
    try {
      // looks up our code verifier associated with the customer identifier saved in the state variable
      codeVerifier = await pkceStorage.retrieve(callbackInfo.state)
    } catch (e) {
      res.send(404)
    }
    if (codeVerifier) {
      // Creates the actual access and refresh tokens and then saves them to the place outlined in token storage. Tn this case our database.
      await oauthApi.createTokens(callbackInfo.state, codeVerifier, callbackInfo.code, appRedirectUrl)
      // you can start using the api now by creating an OAuthSession
      await pkceStorage.remove(callbackInfo.state)
      res.send(`Customer ${callbackInfo.state} is registered`)
    }
  }
  res.status(404)
});

app.get('/profiles/:customerIdentifier', async (req: Request, res: Response) => {
  // creates an auth session for our passed in customerIdentifier
  const session = new OAuthSession(req.params.customerIdentifier, oauthApi)
  // passes the session into the api
  const profileApi = new ProfilesApi(session)
  // gets the (up to) first 20 profiles for the klaviyo account associated with the customer identifier
  const profiles = (await profileApi.getProfiles()).body
  res.send(profiles)
})

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});