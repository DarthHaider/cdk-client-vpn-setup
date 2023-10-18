#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CvpnStack } from "../lib/cvpn-stack";

const app = new cdk.App();
new CvpnStack(app, "boi");
