import { Construct } from "constructs";
import { ClientVpnEndpointOptions, IVpc } from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

/**
 * Interface for the properties required to attach a Client VPN.
 */
export interface AttachClientVpnProps extends ClientVpnEndpointOptions {
  vpc: IVpc;
}

/**
 * AttachClientVpn class encapsulates logic for attaching a Client VPN to a VPC.
 */
export class AttachClientVpn extends Construct {
  /**
   * Constructs a new instance of AttachClientVpn.
   * @param {Construct} scope - Parent construct.
   * @param {string} id - Identifier for this construct.
   * @param {AttachClientVpnProps} props - Properties for the Client VPN.
   */
  constructor(scope: Construct, id: string, props: AttachClientVpnProps) {
    super(scope, id);

    // Extract properties and set default values
    const { vpc, splitTunnel = true, logging = true, logGroup } = props;

    // Add a Client VPN endpoint to the VPC
    vpc.addClientVpnEndpoint(`${id}VPN`, {
      ...props,
      splitTunnel,
      logging,
      logGroup: logGroup ?? this.createLogGroup(id),
    });
  }

  /**
   * Create a log group with a retention of TEN_YEARS.
   * @returns {LogGroup} New log group.
   */
  private createLogGroup(id: string): LogGroup {
    return new LogGroup(this, `${id}Logs`, {
      retention: RetentionDays.TEN_YEARS,
    });
  }
}
