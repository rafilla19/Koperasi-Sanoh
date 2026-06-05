from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/v1/', include('api.urls')),
    path('api/ml/', include('ml_service.urls')),
    path('api/v1/', include('api.shu.urls')),
    path('api/', include('api.saving.urls')),
    path('api/', include('api.shu.urls')),
    path('api/', include('api.master.urls')),
    path('api/', include('api.member.urls')),
]

