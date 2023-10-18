import boto3
import json

# Buckets you want to keep, specified by their names
BUCKETS_TO_KEEP = [
    "cdk-hnb659fds-assets-150192942682-us-east-1",
    "cdk-hnb659fds-assets-150192942682-us-east-2",
    "cf-templates-13b68qyq6c213-us-east-1",
    "cloudtrail-awslogs-150192942682-cixuj50q-isengard-do-not-delete",
    "do-not-delete-gatedgarden-audit-150192942682"
]

s3 = boto3.resource('s3')
client = boto3.client('s3')

# List all buckets
for bucket in s3.buckets.all():
    if bucket.name not in BUCKETS_TO_KEEP:
        print(f"Deleting bucket {bucket.name} ...")
        # Check if versioning is enabled
        bucket_versioning = s3.BucketVersioning(bucket.name)
        if bucket_versioning.status == 'Enabled':
            print(f"  Deleting object versions from {bucket.name}")
            # Delete all object versions
            versions = bucket.object_versions.all()
            print(f"Deleting bucket {bucket.name} ...")
            for version in versions:
                version.delete()
        else:
            print(f"  Deleting objects from {bucket.name}")
            # Delete all objects
            bucket.objects.all().delete()

        # Try to delete the bucket itself
        try:
            bucket.delete()
            print(f"Bucket {bucket.name} deleted")
        except Exception as e:
            print(f"Failed to delete bucket {bucket.name}: {e}")
