import { env } from 'process';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import knex from 'knex';

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

  const knexClient = knex({
    client: 'pg',
    connection: {
      host: secret.host,
      port: secret.port,
      database: secret.dbname,
      user: secret.username,
      password: secret.password,
    },
  });

  try {
    await knexClient.schema.createTable('entities', (table) => {
      table.increments('id');
      table.string('name');
    });
  } catch (error) {
    console.log(`Error creating table: ${JSON.stringify(error as Error)}`);
  }

  console.log('Knex created table');

  try {
    await knexClient('entities').insert({ id: '1', name: 'Number 1' });
  } catch (error) {
    console.log(`Error inserting: ${JSON.stringify(error as Error)}`);
  }

  try {
    const selectOutput = await knexClient('entities').select({
      id: 'id',
      name: 'name',
    });
    console.log(`Selected: ${JSON.stringify(selectOutput)}`);
  } catch (error) {
    console.log(`Error selecting: ${JSON.stringify(error as Error)}`);
  }

  return {
    statusCode: 200,
    body: 'Success',
  };
};
