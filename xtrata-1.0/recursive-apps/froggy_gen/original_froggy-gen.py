from PIL import Image
import os
import random
import csv

def get_random_png_from_folder(folder_path):
    png_files = [f for f in os.listdir(folder_path) if f.endswith('.png')]
    if not png_files:
        return None, []
    selected = random.choice(png_files)
    return os.path.join(folder_path, selected), selected

def combine_pngs_to_single_image(folders, output_image, used_combinations, csv_writer, gif_images, special_folder, special_index):
    if special_folder and special_index <= 10 and i == special_index * 200:  # Adjust interval for special images
        special_file = f"{special_index}.png"
        special_image_path = os.path.join(special_folder, special_file)
        Image.open(special_image_path).save(output_image)
        print(f"Saved special image as {output_image}")
        csv_writer.writerow([])  # Write an empty row for special images
        return Image.open(special_image_path), used_combinations, special_index + 1

    base_image = None
    current_combination = []
    for folder in folders:
        png_file, selected = get_random_png_from_folder(folder)
        if png_file:
            current_combination.append(selected)
            img = Image.open(png_file).convert("RGBA")
            if base_image is None:
                base_image = img
            else:
                base_image = Image.alpha_composite(base_image, img)

    if tuple(current_combination) in used_combinations:
        return None, used_combinations, special_index

    if base_image:
        base_image.save(output_image, "PNG")
        print(f"Saved combined image as {output_image}")
        used_combinations.add(tuple(current_combination))
        csv_writer.writerow(current_combination)
        if i <= 20:  # Add only the first 20 images to the gif_images list
            gif_images.append(base_image)
        return base_image, used_combinations, special_index
    else:
        print("No PNG files found in the specified folders.")
        return None, used_combinations, special_index

List of folders containing PNG files
folders = [
    'C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\background',
    'C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\body',
    'C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\eyes',
    'C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\mouth',
    'C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\stripe',
]

Special folder for specific images
special_folder = 'C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\1s'

Keep track of used combinations
used_combinations = set()

List to store images for the GIF
gif_images = []

Open CSV file for writing
with open('combinations.csv', 'w', newline='') as csvfile:
    csv_writer = csv.writer(csvfile)

    special_index = 1
    for i in range(1, 10001):
        output_image = f'{i}.png'
        combined_image, used_combinations, special_index = combine_pngs_to_single_image(folders, output_image, used_combinations, csv_writer, gif_images, special_folder, special_index)
        while combined_image is None:
            combined_image, used_combinations, special_index = combine_pngs_to_single_image(folders, output_image, used_combinations, csv_writer, gif_images, special_folder, special_index)

Create a GIF from the first 20 images
if gif_images:
    gif_path = os.path.join('final', 'combined_first_20.gif')
    gif_images[0].save(gif_path, save_all=True, append_images=gif_images[1:], loop=0, duration=500)
    print("Saved the first 20 combined images as a GIF.")