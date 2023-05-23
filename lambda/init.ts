import { env } from 'process';
import * as pg from 'pg';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export const handler = async () => {
  const secretsManagerClient = new SecretsManagerClient({});

  let secret;

  try {
    const getSecretValueOutput = await secretsManagerClient.send(
      new GetSecretValueCommand({
        SecretId: env.DB_SECRET_ARN,
      })
    );

    secret = JSON.parse(getSecretValueOutput.SecretString!);

    console.log('Secret received:\n' + getSecretValueOutput.SecretString!);
  } catch (error) {
    return {
      statusCode: 500,
      body: 'Error fetching secret from SecretsManager',
    };
  }

  const pgClient = new pg.Client({
    host: secret.host,
    port: secret.port,
    database: secret.dbname,
    user: secret.username,
    password: secret.password,
  });

  await pgClient.connect();

  console.log('DB Client Connected');

  return {
    statusCode: 200,
    body: 'Success',
  };
};
