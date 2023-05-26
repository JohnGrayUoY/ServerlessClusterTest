import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import {
  SecretRotation,
  SecretRotationApplication,
} from 'aws-cdk-lib/aws-secretsmanager';
import { version } from 'os';

export class ServerlessClusterTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'TestServerlessClusterVpc');

    const dbName = 'testDB';
    const dbUsername = 'testUsername';

    const securityGroup = new SecurityGroup(
      this,
      'TestServerlessClusterSecGroup',
      {
        vpc,
      }
    );

    const parameterGroup = new rds.ParameterGroup(
      this,
      'TestServerlessParameterGroup',
      {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_14_5,
        }),
        parameters: {
          shared_preload_libraries: 'pg_stat_statements, pg_tle',
        },
      }
    );

    const serverlessCluster = new rds.DatabaseCluster(
      this,
      'Test Serverless Cluster',
      {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_14_5,
        }),
        instanceProps: {
          vpc,
          instanceType: 'serverless' as any,
          securityGroups: [securityGroup],
          parameterGroup,
        },
        defaultDatabaseName: dbName,
        credentials: { username: dbUsername },
      }
    );

    new SecretRotation(this, 'TestClusterSecretRotation', {
      application: SecretRotationApplication.POSTGRES_ROTATION_SINGLE_USER,
      secret: serverlessCluster.secret!,
      target: serverlessCluster,
      vpc: vpc,
    });

    // Adding this to DatabaseCluster class is WIP.
    // This sets the scaling of the cluster as currently unavailable.
    // https://github.com/aws/aws-cdk/issues/20197
    cdk.Aspects.of(serverlessCluster).add({
      visit(node) {
        if (node instanceof rds.CfnDBCluster) {
          node.serverlessV2ScalingConfiguration = {
            minCapacity: 0.5,
            maxCapacity: 1,
          };
        }
      },
    });

    const lambdaFn = new NodejsFunction(
      this,
      'Test Serverless Cluster Init Lambda (DELETE)',
      {
        entry: './lambda/init.ts',
        runtime: Runtime.NODEJS_18_X,
        handler: 'handler',
        environment: {
          DB_SECRET_ARN: serverlessCluster.secret?.secretArn ?? '',
        },
        vpc,
        securityGroups: [securityGroup],
        bundling: {
          nodeModules: ['knex', 'pg'],
        },
      }
    );

    serverlessCluster.secret?.grantRead(lambdaFn);

    serverlessCluster.connections.allowFrom(
      securityGroup,
      Port.tcp(serverlessCluster.clusterEndpoint.port)
    );

    const api = new RestApi(this, 'TestClusterRestApi');

    const resource = api.root.addResource('init');
    resource.addMethod(HttpMethod.GET, new LambdaIntegration(lambdaFn));
  }
}
