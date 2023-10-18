const fs = require("fs");

/**
 * @classdesc
 * CIDR library based on npm package 'cidr-lib' by Tim Black (timblack1)
 * @see https://github.com/timblack1/cidr-lib
 */
export class Cidr {
  /**
   * Constructor
   */
  constructor() {}

  /**
   * Determine if the new subnet overlaps the existing subnet.
   *
   * @param {string} first_cidr The first CIDR to compare.
   * @param {string} second_cidr The second CIDR to compare.
   * @returns {boolean} True if the subnets overlap, otherwise false.
   */
  static doSubnetsOverlap(first_cidr: string, second_cidr: string): boolean {
    // Convert subnets to their IP addresses' binary representations, truncated to the
    // shortest of their two CIDR prefix lengths.
    const prefixes_array = Cidr._getPrefixesOfShortestEqualLength(
      first_cidr,
      second_cidr
    );

    // Compare the two prefixes.
    return prefixes_array[0] === prefixes_array[1];
  }

  /**
   * Convert subnets to their IP addresses' binary representations, truncated to the
   * shortest of their two CIDR prefix lengths.
   *
   * @param {string} first_cidr The first CIDR from which to get a prefix.
   * @param {string} second_cidr The second CIDR from which to get a prefix.
   * @returns {string[]} An array containing the binary representations of the two input CIDRs,
   *                      truncated to the shortest of their two prefix lengths.
   */
  static _getPrefixesOfShortestEqualLength(
    first_cidr: string,
    second_cidr: string
  ): string[] {
    const shortest_prefix_length = Math.min(
      Cidr._getPrefixLength(first_cidr),
      Cidr._getPrefixLength(second_cidr)
    );
    const first_binary_prefix = Cidr._getBinaryPrefix(
      first_cidr,
      shortest_prefix_length
    );
    const second_binary_prefix = Cidr._getBinaryPrefix(
      second_cidr,
      shortest_prefix_length
    );

    return [first_binary_prefix, second_binary_prefix];
  }

  /**
   * Convert one subnet to the binary representation of its IP address, truncated to its
   * CIDR prefix length. If the CIDR is incomplete or specifies no prefix length,
   * assume it is the left-most portion of the CIDR, and consider its binary length to
   * be its prefix_length.
   *
   * @param {string} cidr The CIDR whose binary prefix should be returned.
   * @param {number} prefix_length The integer length of the CIDR's binary prefix.
   * @returns {string} The CIDR's binary prefix.
   */
  static _getBinaryPrefix(cidr: string, prefix_length?: number): string {
    const binary_classes = Cidr.getBinaryRepresentation(cidr);

    // Handle incomplete CIDR.
    if (binary_classes.length < 32 && cidr.indexOf("/") === -1) {
      prefix_length = binary_classes.length;
    }

    // Ensure prefix_length is defined.
    prefix_length = prefix_length || 32;

    // Truncate string to prefix length.
    const binary_prefix = binary_classes.substring(0, prefix_length);
    return binary_prefix;
  }

  /**
   * Get the CIDR's binary representation including both its prefix and suffix.
   *
   * @param {string} cidr The CIDR whose binary representation should be returned.
   * @returns {string} The CIDR's binary representation.
   */
  static getBinaryRepresentation(cidr: string): string {
    // Get classes as an array.
    var classes = Cidr._getClasses(cidr);

    // Convert classes to binary, and join the classes into one string.
    const binaryClassesString = classes
      .map(function (decimal: string) {
        const unpadded = parseInt(decimal, 10).toString(2);
        const pad = "00000000";
        const padded =
          pad.substring(0, pad.length - unpadded.length) + unpadded;
        return padded;
      })
      .join("");

    return binaryClassesString;
  }

  /**
   * Get the CIDR's prefix length as an integer. Handle incomplete CIDRs by counting their binary
   * length as their prefix_length.
   *
   * @param {string} cidr The CIDR whose prefix length should be returned.
   * @returns {number} The CIDR's prefix length as an integer.
   */
  static _getPrefixLength(cidr: string): number {
    return cidr.indexOf("/") !== -1
      ? parseInt(cidr.split("/")[1], 10)
      : Cidr._getBinaryPrefix(cidr).length;
  }

  /**
   * Get the CIDR's classes as an array of classes.
   *
   * @param {string} cidr The CIDR whose classes should be returned.
   * @returns {string[]} An array of the classes in the CIDR.
   */
  static _getClasses(cidr: string): string[] {
    return cidr.split("/")[0].split(".");
  }

  /**
   * Sort CIDRs by their binary representation.
   *
   * @param {string} a The first CIDR to sort.
   * @param {string} b The second CIDR to sort.
   * @returns {number} 1 means sort a before b; 0 means they sort to the same level; -1 means sort a after b.
   */
  static sortCidrByBinary(a: string, b: string): number {
    const a_bin = Cidr.getBinaryRepresentation(a);
    const b_bin = Cidr.getBinaryRepresentation(b);

    // Compare as strings (to handle integers bigger than 2^53).
    let a_string = String(a_bin); // Convert to string.
    let b_string = String(b_bin); // Convert to string.

    let out: number = 0; // Default value

    if (a_string > b_string) {
      out = 1;
    } else if (a_string < b_string) {
      out = -1;
    }

    return out;
  }

  /**
   * Check if a single CIDR overlaps with any CIDRs in an array of CIDR lists.
   *
   * @param {string} singleCidr The single CIDR to check.
   * @param {string[]} cidrLists An array of CIDR lists to compare against.
   * @returns {boolean} True if the single CIDR overlaps with any CIDR in the lists, false otherwise.
   */
  static doesCidrOverlapWithLists(
    singleCidr: string,
    cidrLists: string[][]
  ): boolean {
    for (const cidrList of cidrLists) {
      for (const cidr of cidrList) {
        if (Cidr.doSubnetsOverlap(singleCidr, cidr)) {
          return true; // Overlap found.
        }
      }
    }
    return false; // No overlap found with any CIDR in the lists.
  }

  /**
   * Generate a non-overlapping CIDR from a list of existing CIDRs and update cdk.json context if not present.
   *
   * @param {string[]} existingCidrs An array of existing CIDRs.
   * @returns {string} A non-overlapping CIDR.
   */
  static generateNonOverlappingCidr(existingCidrs: string[]): string {
    // Sort the existing CIDRs by their binary representations.
    existingCidrs.sort(Cidr.sortCidrByBinary);

    // Initialize with a default CIDR.
    let nonOverlappingCidr = "10.0.0.0/24"; // Replace with an appropriate starting CIDR.

    // Read the existing cdk.json file.
    const cdkJsonPath = "cdk.json";
    const cdkJson = JSON.parse(fs.readFileSync(cdkJsonPath, "utf8"));

    // Check if the CIDR value is already present in the context.
    if (cdkJson.context && cdkJson.context.clientVpnEndpointCidr) {
      nonOverlappingCidr = cdkJson.context.clientVpnEndpointCidr;
    } else {
      // Generate a new non-overlapping CIDR and update the context.
      for (const cidr of existingCidrs) {
        const newCidr = Cidr.calculateNonOverlappingCidr(
          nonOverlappingCidr,
          cidr
        );

        if (newCidr) {
          nonOverlappingCidr = newCidr;
          break;
        }
      }

      // Update cdk.json context with the generated CIDR.
      if (!cdkJson.context) {
        cdkJson.context = {};
      }
      cdkJson.context.clientVpnEndpointCidr = nonOverlappingCidr;
      fs.writeFileSync(cdkJsonPath, JSON.stringify(cdkJson, null, 2), "utf8");
    }

    return nonOverlappingCidr;
  }

  /**
   * Calculate a non-overlapping CIDR between two existing CIDRs.
   *
   * @param {string} existingCidr1 The first existing CIDR.
   * @param {string} existingCidr2 The second existing CIDR.
   * @returns {string | null} A non-overlapping CIDR, or null if no valid CIDR can be calculated.
   */
  static calculateNonOverlappingCidr(
    existingCidr1: string,
    existingCidr2: string
  ): string | null {
    const [ip1, prefix1] = existingCidr1.split("/");
    const [ip2, prefix2] = existingCidr2.split("/");

    // Convert IP addresses to numeric values.
    const ip1Numeric = Cidr.ipToNumeric(ip1);
    const ip2Numeric = Cidr.ipToNumeric(ip2);

    // Calculate the maximum prefix length allowed (between /22 and /12).
    const maxPrefixLength = Math.min(
      Math.max(parseInt(prefix1, 10), parseInt(prefix2, 10)) - 1,
      12
    );

    // Calculate the new IP address based on the maximum prefix length.
    const newIpNumeric =
      Math.max(ip1Numeric, ip2Numeric) + Math.pow(2, 32 - maxPrefixLength);

    // Check if the new IP is within the valid range (0.0.0.0 to 255.255.255.255).
    if (newIpNumeric >= 0 && newIpNumeric <= 4294967295) {
      return `${Cidr.numericToIp(newIpNumeric)}/${maxPrefixLength}`;
    }

    return null;
  }

  /**
   * Convert an IP address in the form of a string to a numeric value.
   *
   * @param {string} ipAddress The IP address in the form of a string.
   * @returns {number} The numeric representation of the IP address.
   */
  static ipToNumeric(ipAddress: string): number {
    const [a, b, c, d] = ipAddress.split(".").map(Number);
    return (a << 24) | (b << 16) | (c << 8) | d;
  }

  /**
   * Convert a numeric IP value to a string IP address.
   *
   * @param {number} numericIp The numeric IP value.
   * @returns {string} The IP address in the form of a string.
   */
  static numericToIp(numericIp: number): string {
    return [
      (numericIp >> 24) & 255,
      (numericIp >> 16) & 255,
      (numericIp >> 8) & 255,
      numericIp & 255,
    ].join(".");
  }
  /**
   * Generate a DNS server IP based on the VPC CIDR block.
   * @param {string} vpcCidr - VPC CIDR block.
   * @returns {string} A DNS server IP.
   */
  static generateDnsServerIp(vpcCidr: string): string {
    const [ipAddress, prefixLength] = vpcCidr.split("/");

    if (!ipAddress || !prefixLength) {
      throw new Error("Invalid VPC CIDR format");
    }

    const ipParts = ipAddress.split(".");
    if (ipParts.length !== 4) {
      throw new Error("Invalid IP address format");
    }

    const startIpParts = ipParts.map((part) => parseInt(part, 10));
    const prefix = parseInt(prefixLength, 10);

    // Calculate the new IP address
    startIpParts[3] += 2; // Add 2 to the last part of the IP address

    // Handle carry over
    for (let i = 3; i >= 0; i--) {
      if (startIpParts[i] > 255) {
        startIpParts[i] -= 256;
        if (i > 0) {
          startIpParts[i - 1]++;
        }
      }
    }

    // Format the new IP address
    const newStartIp = startIpParts.join(".");

    return `${newStartIp}`;
  }
}
