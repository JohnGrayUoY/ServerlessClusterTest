import { env } from 'process';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import knex from 'knex';
import { randomUUID } from 'crypto';
import * as pg from 'pg';

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

  try {
    await pgClient.query('CREATE EXTENSION ltree');
  } catch (error) {
    // Do nothing. Just ensure this module is loaded.
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

  const tableName = randomUUID();

  try {
    await knexClient.schema.createTable(tableName, (table) => {
      table.increments('id');
      table.string('name');
      table.specificType('testLTree', 'ltree');
    });
  } catch (error) {
    return {
      statusCode: 500,
      body: `Error creating table: ${JSON.stringify(error as Error)}`,
    };
  }

  console.log('Knex created table');

  const insertObjectId = Math.floor(Math.random() * 1000);

  console.log('Insert Id: ' + insertObjectId);

  const insertObject = {
    id: insertObjectId,
    name: `Name of ${insertObjectId}`,
    testLTree: insertObjectId.toString(),
  };

  try {
    await knexClient(tableName).insert(insertObject);
  } catch (error) {
    return {
      statusCode: 500,
      body: `Error inserting: ${JSON.stringify(error as Error)}`,
    };
  }

  try {
    const selectOutput = await knexClient(tableName).select({
      id: 'id',
      name: 'name',
      testLTree: 'testLTree',
    });
    console.log(`Selected: ${JSON.stringify(selectOutput)}`);
  } catch (error) {
    return {
      statusCode: 500,
      body: `Error selecting: ${JSON.stringify(error as Error)}`,
    };
  }

  return {
    statusCode: 200,
    body: 'Success',
  };
};
