#!/usr/bin/env python3

import json
import struct
import subprocess
import sys

def send_message(message):
    """Send a message to the native host using Chrome's native messaging protocol."""
    # Convert message to JSON string
    message_json = json.dumps(message)
    
    # Get message length as 4-byte integer
    message_length = struct.pack('I', len(message_json))
    
    # Write message length and message to stdout
    sys.stdout.buffer.write(message_length)
    sys.stdout.buffer.write(message_json.encode('utf-8'))
    sys.stdout.buffer.flush()

def read_message():
    """Read a message from the native host using Chrome's native messaging protocol."""
    # Read the message length (first 4 bytes)
    length_data = sys.stdin.buffer.read(4)
    if len(length_data) == 0:
        return None
    
    # Unpack message length as 4-byte integer
    message_length = struct.unpack('I', length_data)[0]
    
    # Read the message of the specified length
    message_data = sys.stdin.buffer.read(message_length)
    
    # Parse the message
    message = json.loads(message_data.decode('utf-8'))
    return message

def test_native_host(action="getAllIPs"):
    """Test the native messaging host by running the host program and sending a message."""
    # Path to the native host script
    host_path = "./zscaler_host.py"
    
    # Create the message
    message = {"action": action}
    
    # Convert message to JSON string
    message_json = json.dumps(message)
    
    # Get message length as 4-byte integer
    message_length = struct.pack('I', len(message_json))
    
    # Create a subprocess to run the native host
    process = subprocess.Popen(
        [host_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    try:
        # Write message length and message to the subprocess stdin
        process.stdin.write(message_length)
        process.stdin.write(message_json.encode('utf-8'))
        process.stdin.flush()
        
        # Read response length (first 4 bytes)
        length_data = process.stdout.read(4)
        if len(length_data) == 0:
            print("Error: No data received from native host")
            stderr = process.stderr.read().decode('utf-8')
            if stderr:
                print(f"Error output: {stderr}")
            return None
        
        # Unpack response length as 4-byte integer
        response_length = struct.unpack('I', length_data)[0]
        
        # Read response data
        response_data = process.stdout.read(response_length)
        
        # Parse response JSON
        response = json.loads(response_data.decode('utf-8'))
        
        return response
    finally:
        # Close subprocess streams
        process.stdin.close()
        process.stdout.close()
        process.stderr.close()
        
        # Wait for process to terminate
        process.wait()

def format_ip_list(ips):
    """Format a list of IPs for display."""
    if not ips:
        return "None"
    return "\n  - " + "\n  - ".join(ips)

def format_categorized_ips(categorized):
    """Format categorized IPs for display."""
    result = []
    
    if categorized.get("docker"):
        result.append(f"Docker Network: {categorized['docker']}")
    else:
        result.append("Docker Network: None detected")
        
    if categorized.get("nonPrivate"):
        result.append(f"Non-private IP: {categorized['nonPrivate']}")
    else:
        result.append("Non-private IP: None detected")
        
    if categorized.get("private"):
        result.append(f"Private IP: {categorized['private']}")
    else:
        result.append("Private IP: None detected")
        
    return "\n".join(result)

def main():
    # Test getting all IPs
    print("Testing getAllIPs...")
    response = test_native_host("getAllIPs")
    
    if response and response.get("success"):
        ips = response.get("ips", [])
        print(f"Success! Found {len(ips)} IP(s):")
        if ips:
            for ip in ips:
                print(f"  - {ip}")
        else:
            print("  No IPs found")
    else:
        print(f"Error: {response.get('error', 'Unknown error')}")
    
    print("\nTesting getCategorizedIPs...")
    response = test_native_host("getCategorizedIPs")
    
    if response and response.get("success"):
        categorized = response.get("categorized", {})
        print("Success! Categorized IPs:")
        print(format_categorized_ips(categorized))
    else:
        print(f"Error: {response.get('error', 'Unknown error')}")

if __name__ == "__main__":
    main()

