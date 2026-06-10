import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Replace CSS font-family rules
    content = re.sub(r'font-family:\s*var\(--font-h,\s*\'Syne\',\s*sans-serif\);', 'font-family: var(--font-family);', content)
    content = re.sub(r'font-family:\s*var\(--font-h,\s*\'Outfit\',\s*\'Syne\',\s*sans-serif\);', 'font-family: var(--font-family);', content)
    content = re.sub(r'font-family:\s*\'Space Grotesk\',\s*var\(--font-h,\s*\'Syne\'\),\s*sans-serif;', 'font-family: var(--font-family);', content)
    content = re.sub(r'font-family:\s*var\(--font-h,\s*\'Syne\'\);', 'font-family: var(--font-family);', content)
    content = re.sub(r'--dh-font-head:\s*\'Syne\',\s*sans-serif;', '--dh-font-head: var(--font-family);', content)
    content = re.sub(r'--font-h:\s*\'Syne\',\s*sans-serif;', '--font-h: var(--font-family);', content)
    
    # Inline JSX styles
    content = re.sub(r"fontFamily:\s*'Syne',\s*fontWeight:\s*700", r"fontFamily: 'var(--font-family)', fontWeight: 700", content)
    content = re.sub(r"fontFamily:\s*'Syne,\s*sans-serif'", r"fontFamily: 'var(--font-family)'", content)
    
    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated: {filepath}")

def main():
    src_dir = r"c:\Users\Asus\Documents\Koperasi-Sanoh\frontend\src"
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(('.css', '.jsx')):
                process_file(os.path.join(root, file))
                
if __name__ == "__main__":
    main()
