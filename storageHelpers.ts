import {CreatedTokens, Pkce, RetrievedTokens, TokenStorage} from "klaviyo-api";
import {PrismaClient} from "@prisma/client";

const crypto = require('node:crypto');

class PrismaTokenStorage implements TokenStorage {
  readonly algorithm = 'aes-256-cbc'; //Using AES encryption
  readonly splitKey = ":"

  constructor(readonly prismaConnection: PrismaClient, readonly key: string) {
  }

  async retrieve(customerIdentifier: string): Promise<RetrievedTokens> {
    const result = await this.prismaConnection.customerTokens.findUnique({where: {customerIdentifier}})
    if (result) {

      const parts = result.refreshToken.split(this.splitKey)
      const iv = Buffer.from(parts[1], 'hex')
      const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.key, 'hex'), iv)
      const refreshToken = decipher.update(parts[0], 'hex', 'utf8') + decipher.final('utf8'); //deciphered text

      return {accessToken: result.accessToken, refreshToken: refreshToken, expiresAt: result.expiresAt}
    } else {
      throw Error("Token Not Found")
    }
  }

  async save(customerIdentifier: string, tokens: CreatedTokens): Promise<void> {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.key, 'hex'), iv)
    const cipherText = cipher.update(tokens.refreshToken, 'utf8', 'hex') + cipher.final('hex');
    const tokenAndIv = `${cipherText}${this.splitKey}${iv.toString('hex')}`
    await this.prismaConnection.customerTokens.upsert({
      where: {
        customerIdentifier
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokenAndIv,
        expiresAt: tokens.expiresAt,
      },
      create: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        customerIdentifier
      }
    })
  }
}

class PrismPkceStorage implements Pkce.CodeStorage {

  constructor(readonly prismaConnection: PrismaClient) {
  }

  async remove(customerIdentifier: string): Promise<void> {
    await this.prismaConnection.customerPkceCodes.delete({where: {customerIdentifier}})
  }

  async retrieve(customerIdentifier: string): Promise<string> {
    const result = await this.prismaConnection.customerPkceCodes.findUnique({where: {customerIdentifier}})
    if (result) {
      return result.codeVerifier
    } else {
      throw Error("Codes not Found")
    }
  }

  async save(customerIdentifier: string, codeVerifier: string): Promise<void> {
    await this.prismaConnection.customerPkceCodes.upsert({
      where: {
        customerIdentifier
      },
      update: {
        codeVerifier
      },
      create: {
        codeVerifier,
        customerIdentifier
      }
    })
  }
}

export {PrismPkceStorage, PrismaTokenStorage}