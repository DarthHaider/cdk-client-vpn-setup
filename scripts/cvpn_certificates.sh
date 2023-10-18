#!/bin/bash

set -e

# ----------- Constants -----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS=$(uname -s)

credentials_dir="$SCRIPT_DIR/vpn_credentials"

# JSON object to hold secret ARNs
SECRETS_JSON="{\"secretsManager\": {}}"

# ----------- Functions -----------

# Log message with a timestamp
log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $1"
}

# Define the spinner function
spinner() {
    local pid=$!
    local delay=0.75
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Check for existing secrets in AWS Secrets Manager and confirm overwrite
check_and_confirm_overwrite() {
    echo""
    local unique_id=$1
    local secret_list=("${unique_id}_CA_Certificate" "${unique_id}_CA_Key" "${unique_id}_Server_Certificate" "${unique_id}_Server_Key")

    local existing_secrets=()
    local non_existing_secrets=()

    echo -e "\033[1;94m──────────────────────────────────────────────\033[0m" >&2
    echo -e "\033[1;92m     Check for Existing Secrets in AWS        \033[0m" >&2
    echo -e "\033[1;94m──────────────────────────────────────────────\033[0m" >&2

    # Initialize loading bar
    echo ""
    local total=${#secret_list[@]}
    local current=0

    for secret_name in "${secret_list[@]}"; do
        # Update progress bar
        current=$((current + 1))
        progress=$((current * 100 / total))
        # Calculate the number of pound signs (#) based on progress
        num_pounds=$((progress / 2))
        # Calculate the number of spaces based on remaining progress
        num_spaces=$((50 - num_pounds))
        bar="["
        for ((i = 0; i < num_pounds; i++)); do
            bar+="#"
        done
        for ((i = 0; i < num_spaces; i++)); do
            bar+=" "
        done
        bar+="] $progress%"
        echo -ne "\033[1;92mChecking for secrets: $bar\033[0K\r"
        if secret_exists "$secret_name"; then
            existing_secrets+=("$secret_name")
        else
            non_existing_secrets+=("$secret_name")
        fi
    done
    echo ""
    echo ""

    if [ ${#existing_secrets[@]} -ne 0 ]; then
        echo -e "\033[1;93mExisting secrets:\033[0m" >&2 # Use yellow color (1;93)
        echo ""
        for secret in "${existing_secrets[@]}"; do
            echo -e "  \033[1;93m⚬ \033[0;93m$secret\033[0m" >&2
        done
        echo
    fi

    if [ ${#non_existing_secrets[@]} -ne 0 ]; then
        echo -e "\033[1;96mNon-existing secrets:\033[0m" >&2
        echo ""
        for secret in "${non_existing_secrets[@]}"; do
            echo -e "  \033[1;92m✔ \033[0;32m$secret\033[0m" >&2
        done
    fi

    local prompt_message=""

    if [ ${#existing_secrets[@]} -eq 0 ]; then
        prompt_message="No existing secrets found. Generate new ones? [y/n]:"
    elif [ ${#existing_secrets[@]} -eq 4 ]; then
        prompt_message="All secrets exist. Overwrite and generate new ones? [y/n]:"
    else
        prompt_message="Some secrets exist. Overwrite and generate new ones? [y/n]:"
    fi

    while true; do
        if [ ${#existing_secrets[@]} -ne 0 ] || [ ${#non_existing_secrets[@]} -ne 0 ]; then
            echo -e "\033[1;96m$prompt_message\033[0m" >&2
        fi
        echo -ne "\033[1;96m› \033[0;39m" >&2

        read choice
        case "$choice" in
        y | Y)
            echo -e "\033[1;92m✔ \033[0;32mProceeding...\033[0m" >&2
            break
            ;;
        n | N)
            echo -e "\033[1;91m✖ \033[0;31mUser chose not to overwrite. Exiting.\033[0m" >&2
            exit 1
            ;;
        *)
            echo -e "\033[1;91m✖ \033[0;31mInvalid choice. Please enter 'y' or 'n'.\033[0m" >&2
            ;;
        esac
    done

}

# Update SECRETS_JSON with a new secret ARN
update_secrets_json() {
    local secret_name=$1
    local secret_arn=$2
    SECRETS_JSON=$(echo $SECRETS_JSON | jq ".secretsManager[\"$secret_name\"] = \"$secret_arn\"")
}

prompt_for_unique_id() {
    local UNIQUE_ID
    echo -e "\033[1;94m──────────────────────────────────────────────\033[0m" >&2
    echo -e "\033[1;92m        Generate Client VPN Certificates      \033[0m" >&2
    echo -e "\033[1;94m──────────────────────────────────────────────\033[0m" >&2

    while true; do
        echo -e "\033[1;96mPlease enter a unique ID to use for generating your VPN certificates:\033[0m" >&2

        echo -ne "\033[1;96m› \033[0;39m" >&2
        read UNIQUE_ID
        UNIQUE_ID=$(echo "$UNIQUE_ID" | xargs)

        if [ -z "$UNIQUE_ID" ]; then
            echo -e "\033[1;91m✖ \033[0;31mID can't be empty. Try again.\033[0m" >&2
        elif [[ ! "$UNIQUE_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
            echo -e "\033[1;91m✖ \033[0;31mUse letters, numbers, underscores, and dashes only. Try again.\033[0m" >&2
        else
            echo -e "\033[1;92m✔ \033[0;32mID accepted. Proceeding...\033[0m" >&2
            break
        fi
    done
    echo "$UNIQUE_ID"
}

# Check if AWS credentials are set up and valid
check_aws_credentials() {
    if ! aws sts get-caller-identity &>/dev/null; then
        log "AWS credentials are not available. Please configure your AWS CLI."
        exit 1
    fi
}

# Determine if a specific AWS SecretsManager secret exists
secret_exists() {
    local secret_name=$1
    aws secretsmanager describe-secret --secret-id "${secret_name}" &>/dev/null
}

# Create or update a given secret in AWS SecretsManager and update SECRETS_JSON
create_or_update_secret() {
    local secret_name=$1
    local secret_value_file=$2

    if secret_exists "$secret_name"; then
        log "Updating secret: ${secret_name}"
        aws secretsmanager update-secret --secret-id "${secret_name}" --secret-string file://"$secret_value_file"
        local secret_arn=$(aws secretsmanager describe-secret --secret-id "${secret_name}" --query 'ARN' --output text)
    else
        log "Creating secret: ${secret_name}"
        local response=$(aws secretsmanager create-secret --name "${secret_name}" --secret-string file://"$secret_value_file")
        local secret_arn=$(echo $response | jq -r '.ARN')
    fi

    update_secrets_json "$secret_name" "$secret_arn"
}

# Ensure a directory exists; create it if it doesn't
ensure_directory_exists() {
    local dir=$1
    if [ ! -d "$dir" ]; then
        mkdir "$dir"
    else
        log "'$dir' directory already exists. Skipping."
    fi
}

# Initialize the easyrsa tool; clone it if necessary
init_easyrsa() {
    if [ ! -d "$SCRIPT_DIR/easy-rsa" ]; then
        git clone https://github.com/OpenVPN/easy-rsa.git
    else
        log "'easy-rsa' directory already exists. Skipping git clone."
    fi

    cd easy-rsa/easyrsa3
    (
        echo 'yes'
        echo 'yes'
    ) | ./easyrsa init-pki

    echo '' | ./easyrsa build-ca nopass
    echo 'yes' | ./easyrsa build-server-full server nopass
}

# Cleanup temporary files and directories
cleanup_files() {
    rm -rf "$SCRIPT_DIR/easy-rsa" "$SCRIPT_DIR/vpn_credentials"
}

# ----------- Main Logic -----------
check_aws_credentials

# Prompt for a unique identifier
UNIQUE_ID=$(prompt_for_unique_id)

# Check for existing secrets and confirm overwrite
check_and_confirm_overwrite "$UNIQUE_ID"

CA_CERT_FILE="$SCRIPT_DIR/vpn_credentials/${UNIQUE_ID}_ca.crt"
CA_KEY_FILE="$SCRIPT_DIR/vpn_credentials/${UNIQUE_ID}_ca.key"
SERVER_CERT_FILE="$SCRIPT_DIR/vpn_credentials/${UNIQUE_ID}_server.crt"
SERVER_KEY_FILE="$SCRIPT_DIR/vpn_credentials/${UNIQUE_ID}_server.key"

cd $SCRIPT_DIR
init_easyrsa

ensure_directory_exists "$credentials_dir"

cp pki/ca.crt "$CA_CERT_FILE"
cp pki/private/ca.key "$CA_KEY_FILE"
cp pki/issued/server.crt "$SERVER_CERT_FILE"
cp pki/private/server.key "$SERVER_KEY_FILE"

ARN=$(aws acm import-certificate --certificate fileb://"$SERVER_CERT_FILE" --private-key fileb://"$SERVER_KEY_FILE" --certificate-chain fileb://"$CA_CERT_FILE" --query 'CertificateArn' --output text)

create_or_update_secret "${UNIQUE_ID}_CA_Certificate" "$CA_CERT_FILE"
create_or_update_secret "${UNIQUE_ID}_CA_Key" "$CA_KEY_FILE"
create_or_update_secret "${UNIQUE_ID}_Server_Certificate" "$SERVER_CERT_FILE"
create_or_update_secret "${UNIQUE_ID}_Server_Key" "$SERVER_KEY_FILE"

# After creating all secrets, update cdk.json
CDK_BASE_DIR=$(find_cdk_base_dir "$SCRIPT_DIR")
if [[ -z $CDK_BASE_DIR ]]; then
    log "CDK project base directory not found. Exiting."
    exit 1
fi

jq ".context += $SECRETS_JSON" "$CDK_BASE_DIR/cdk.json" >"$CDK_BASE_DIR/tmp.json" && mv "$CDK_BASE_DIR/tmp.json" "$CDK_BASE_DIR/cdk.json"
jq '.context.certificatesManager += {"ServerCertificateArn": "'$ARN'", "ClientCertificateArn": "'$ARN'"}' "$CDK_BASE_DIR/cdk.json" >"$CDK_BASE_DIR/tmp.json" && mv "$CDK_BASE_DIR/tmp.json" "$CDK_BASE_DIR/cdk.json"

cleanup_files
