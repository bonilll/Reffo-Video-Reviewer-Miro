import { useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';

export function useProfileImage() {
  const { user } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  
  // Get current profile data
  const userProfile = useQuery(api.users.getProfileByUserId, {
    userId: user?.id || "",
  });
  
  // Mutations
  const updateProfile = useMutation(api.users.updateUserProfile);
  
  // Get current image URL with fallback priority
  const currentImageUrl = userProfile?.profileImageUrl || user?.imageUrl || '';
  
  // Upload function
  const uploadProfileImage = useCallback(async (file: File): Promise<string> => {
    if (!user) throw new Error('User not authenticated');
    
    const fileName = file.name.replace(/\s+/g, '-').toLowerCase();
    
    console.log(`[Profile Image Upload] Starting upload for user ${user.id}, file: ${fileName}`);
    
    // Get signed URL for profile images directory
    const response = await fetch('/api/storage/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: fileName,
        contentType: file.type,
        directory: 'profile-images'
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Upload failed (${response.status})`);
    }
    
    const { uploadUrl, uploadFields, fileUrl } = await response.json();
    
    // Create FormData for upload
    const formData = new FormData();
    Object.entries(uploadFields).forEach(([key, value]) => {
      formData.append(key, value as string);
    });
    formData.append('file', file);
    
    // Upload directly to MinIO
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed (${uploadResponse.status})`);
    }
    
    console.log('[Profile Image Upload] Upload successful:', fileUrl);
    return fileUrl;
  }, [user]);
  
  // Update profile image function
  const updateProfileImage = useCallback(async (file: File) => {
    if (!user) {
      toast.error('User not authenticated');
      return null;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return null;
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('Image size must be less than 5MB');
      return null;
    }
    
    setIsUploading(true);
    
    try {
      console.log('[Profile Image] Starting upload:', file.name);
      
      // Upload the image
      const uploadedUrl = await uploadProfileImage(file);
      
      console.log('[Profile Image] Upload successful:', uploadedUrl);
      
      // Update the profile in the database
      await updateProfile({
        profileImageUrl: uploadedUrl
      });
      
      // Update Clerk user image if possible
      try {
        await user.setProfileImage({ file });
        console.log('[Profile Image] Clerk profile image updated');
      } catch (clerkError) {
        console.warn('[Profile Image] Could not update Clerk image:', clerkError);
        // Continue anyway, our database has the correct image
      }
      
      // Trigger a global refresh event for all avatar components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profileImageUpdated', { 
          detail: { imageUrl: uploadedUrl } 
        }));
        console.log('[Profile Image] Global refresh event dispatched');
      }
      
      toast.success('Profile image updated successfully!');
      
      return uploadedUrl;
      
    } catch (error: any) {
      console.error('[Profile Image] Upload failed:', error);
      toast.error(`Failed to upload image: ${error.message}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [user, uploadProfileImage, updateProfile]);
  
  // File picker function
  const selectAndUploadImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    
    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (file) {
        await updateProfileImage(file);
      }
    };
    
    // Trigger file selection
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }, [updateProfileImage]);
  
  return {
    currentImageUrl,
    isUploading,
    updateProfileImage,
    selectAndUploadImage,
    userProfile
  };
} 