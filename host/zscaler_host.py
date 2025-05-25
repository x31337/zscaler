#!/usr/bin/env python3

import json
import struct
import sys
import subprocess
import re
import platform

# Native messaging protocol implementation
# Reference: https://developer.chrome.com/docs/apps/nativeMessaging/

# Helper function to send a message to the extension
def send_message(message):
    # Convert message to JSON string
    message_json = json.dumps(message)
    # Get message length as 4-byte integer
    message_length = struct.pack('I', len(message_json))
    # Write message length and message to stdout
    sys.stdout.buffer.write(message_length)
    sys.stdout.buffer.write(message_json.encode('utf-8'))
    sys.stdout.buffer.flush()

# Helper function to read a message from the extension
def read_message():
    # Read message length (first 4 bytes)
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

# IP categorization functions
def is_docker_ip(ip):
    """Check if an IP belongs to Docker network (172.17.x.x)"""
    return ip.startswith('172.17.')

def is_private_ip(ip):
    """Check if an IP is in private IP ranges (RFC1918)"""
    return (ip.startswith('10.') or
            ip.startswith('172.16.') or
            ip.startswith('172.18.') or
            ip.startswith('172.19.') or
            ip.startswith('172.2') or  # Covers 172.20.x.x through 172.29.x.x
            ip.startswith('172.30.') or
            ip.startswith('172.31.') or
            ip.startswith('192.168.'))

def is_non_private_ip(ip):
    """Check if an IP is not in private IP ranges and not a Docker IP"""
    return not (is_private_ip(ip) or is_docker_ip(ip) or 
                ip.startswith('127.') or ip.startswith('169.254.'))

def categorize_ips(ips):
    """Categorize IPs into Docker, private, and non-private"""
    result = {
        "docker": None,
        "private": None,
        "nonPrivate": None
    }
    
    # Filter out loopback and link-local addresses
    valid_ips = [ip for ip in ips if not ip.startswith('127.') and not ip.startswith('169.254.')]
    
    if not valid_ips:
        return result
    
    # Find Docker IP
    docker_ips = [ip for ip in valid_ips if is_docker_ip(ip)]
    if docker_ips:
        result["docker"] = docker_ips[0]
    
    # Find non-private IP
    non_private_ips = [ip for ip in valid_ips if is_non_private_ip(ip)]
    if non_private_ips:
        result["nonPrivate"] = non_private_ips[0]
    
    # Find private IP (excluding Docker)
    private_ips = [ip for ip in valid_ips if is_private_ip(ip)]
    if private_ips:
        result["private"] = private_ips[0]
    
    return result

# Function to get all IP addresses from system
def get_all_ips():
    ips = []
    try:
        if platform.system() == "Linux":
            # Get IP addresses from ifconfig
            proc = subprocess.Popen(['ifconfig', '-a'], stdout=subprocess.PIPE)
            ifconfig_output = proc.stdout.read().decode('utf-8')
            
            # Regular expression to find IPv4 addresses
            ip_pattern = re.compile(r'inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)')
            ips = ip_pattern.findall(ifconfig_output)
            
            # Filter out loopback addresses
            ips = [ip for ip in ips if not ip.startswith('127.')]
            
        elif platform.system() == "Darwin":  # macOS
            # Use ifconfig on macOS (similar to Linux)
            proc = subprocess.Popen(['ifconfig'], stdout=subprocess.PIPE)
            ifconfig_output = proc.stdout.read().decode('utf-8')
            
            # Regular expression to find IPv4 addresses
            ip_pattern = re.compile(r'inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)')
            ips = ip_pattern.findall(ifconfig_output)
            
            # Filter out loopback addresses
            ips = [ip for ip in ips if not ip.startswith('127.')]
            
        elif platform.system() == "Windows":
            # Use ipconfig on Windows
            proc = subprocess.Popen(['ipconfig'], stdout=subprocess.PIPE)
            ipconfig_output = proc.stdout.read().decode('utf-8')
            
            # Regular expression to find IPv4 addresses
            ip_pattern = re.compile(r'IPv4 Address[.\s]+: (\d+\.\d+\.\d+\.\d+)')
            ips = ip_pattern.findall(ipconfig_output)
            
            # Filter out loopback addresses
            ips = [ip for ip in ips if not ip.startswith('127.')]
    except Exception as e:
        print(f"Error getting IPs: {str(e)}", file=sys.stderr)
    
    return ips

# Function to get private IP address
def get_private_ip():
    try:
        if platform.system() == "Linux":
            # Get IP addresses from ifconfig
            proc = subprocess.Popen(['ifconfig', '-a'], stdout=subprocess.PIPE)
            ifconfig_output = proc.stdout.read().decode('utf-8')
            
            # Regular expression to find IPv4 addresses
            ip_pattern = re.compile(r'inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)')
            ips = ip_pattern.findall(ifconfig_output)
            
            # Filter out loopback and link-local addresses
            valid_ips = [ip for ip in ips if not ip.startswith('127.') and not ip.startswith('169.254.')]
            
            if valid_ips:
                # Prioritize non-private IPs (not in RFC1918 ranges)
                for ip in valid_ips:
                    if not (ip.startswith('10.') or 
                            ip.startswith('172.16.') or 
                            ip.startswith('172.17.') or 
                            ip.startswith('172.18.') or 
                            ip.startswith('172.19.') or 
                            ip.startswith('172.2') or 
                            ip.startswith('172.30.') or 
                            ip.startswith('172.31.') or 
                            ip.startswith('192.168.')):
                        return ip
                
                # If no non-private IP found, return first valid IP
                return valid_ips[0]
            else:
                return "Not available"
        
        elif platform.system() == "Darwin":  # macOS
            # Use ifconfig on macOS (similar to Linux)
            proc = subprocess.Popen(['ifconfig'], stdout=subprocess.PIPE)
            ifconfig_output = proc.stdout.read().decode('utf-8')
            
            # Regular expression to find IPv4 addresses
            ip_pattern = re.compile(r'inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)')
            ips = ip_pattern.findall(ifconfig_output)
            
            # Filter out loopback and link-local addresses
            valid_ips = [ip for ip in ips if not ip.startswith('127.') and not ip.startswith('169.254.')]
            
            if valid_ips:
                # Same prioritization as Linux
                for ip in valid_ips:
                    if not (ip.startswith('10.') or 
                            ip.startswith('172.16.') or 
                            ip.startswith('172.17.') or 
                            ip.startswith('172.18.') or 
                            ip.startswith('172.19.') or 
                            ip.startswith('172.2') or 
                            ip.startswith('172.30.') or 
                            ip.startswith('172.31.') or 
                            ip.startswith('192.168.')):
                        return ip
                
                return valid_ips[0]
            else:
                return "Not available"
        
        elif platform.system() == "Windows":
            # Use ipconfig on Windows
            proc = subprocess.Popen(['ipconfig'], stdout=subprocess.PIPE)
            ipconfig_output = proc.stdout.read().decode('utf-8')
            
            # Regular expression to find IPv4 addresses
            ip_pattern = re.compile(r'IPv4 Address[.\s]+: (\d+\.\d+\.\d+\.\d+)')
            ips = ip_pattern.findall(ipconfig_output)
            
            # Filter out loopback and link-local addresses
            valid_ips = [ip for ip in ips if not ip.startswith('127.') and not ip.startswith('169.254.')]
            
            if valid_ips:
                # Same prioritization as other platforms
                for ip in valid_ips:
                    if not (ip.startswith('10.') or 
                            ip.startswith('172.16.') or 
                            ip.startswith('172.17.') or 
                            ip.startswith('172.18.') or 
                            ip.startswith('172.19.') or 
                            ip.startswith('172.2') or 
                            ip.startswith('172.30.') or 
                            ip.startswith('172.31.') or 
                            ip.startswith('192.168.')):
                        return ip
                
                return valid_ips[0]
            else:
                return "Not available"
        
        else:
            return "Unsupported platform"
    
    except Exception as e:
        return f"Error: {str(e)}"

# Main function to process messages
def main():
    while True:
        # Read message from extension
        message = read_message()
        if message is None:
            break
        
        # Handle message based on action
        if message.get('action') == 'getPrivateIP':
            # Get private IP address (legacy method)
            ip = get_private_ip()
            
            # Send response back to extension
            send_message({
                'success': True,
                'ip': ip
            })
        elif message.get('action') == 'getAllIPs':
            try:
                # Get all IP addresses
                all_ips = get_all_ips()
                
                # Send all IPs (uncategorized) for backward compatibility
                send_message({
                    'success': True,
                    'ips': all_ips
                })
            except Exception as e:
                send_message({
                    'success': False,
                    'error': f'Error getting all IPs: {str(e)}'
                })
        elif message.get('action') == 'getCategorizedIPs':
            try:
                # Get all IP addresses
                all_ips = get_all_ips()
                
                # Categorize IPs
                categorized = categorize_ips(all_ips)
                
                # Send categorized IPs
                send_message({
                    'success': True,
                    'categorized': categorized
                })
            except Exception as e:
                send_message({
                    'success': False,
                    'error': f'Error getting categorized IPs: {str(e)}'
                })
        else:
            # Unknown action
            send_message({
                'success': False,
                'error': f'Unknown action: {message.get("action")}'
            })

if __name__ == '__main__':
    main()

