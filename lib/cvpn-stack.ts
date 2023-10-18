import { Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { AttachClientVpn } from "./constructs/l3/ClientVpn";
import { cidr } from "../Utilites";

export class CvpnStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    var testvpc = new ec2.Vpc(this, "test-vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: "test-iso-1",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 20,
          name: "test-iso-2",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    new AttachClientVpn(this, "test", {
      cidr: cidr.generateNonOverlappingCidr([
        "10.0.0.0/20",
        "10.0.32.0/20",
        "10.0.48.0/20",
        "10.0.16.0/20",
      ]),
      vpc: testvpc,
      serverCertificateArn:
        "arn:aws:acm:us-east-1:150192942682:certificate/38570544-6965-4195-a1c9-db7e165d8b61",
      clientCertificateArn:
        "arn:aws:acm:us-east-1:150192942682:certificate/38570544-6965-4195-a1c9-db7e165d8b61",
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        onePerAz: true,
      },
      dnsServers: [cidr.generateDnsServerIp("0.0.0.0/16")],
    });
  }
}
