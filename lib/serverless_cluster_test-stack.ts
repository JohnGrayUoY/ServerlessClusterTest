import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

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
        },
        defaultDatabaseName: dbName,
        credentials: { username: dbUsername },
      }
    );

    cdk.Aspects.of(serverlessCluster).add({
      visit(node) {
        if (node instanceof rds.CfnDBCluster) {
          node.serverlessV2ScalingConfiguration = {
            minCapacity: 1,
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
      }
    );

    serverlessCluster.secret?.grantRead(lambdaFn);

    serverlessCluster.connections.allowFrom(
      securityGroup,
      Port.tcp(serverlessCluster.clusterEndpoint.port)
    );
  }
}
