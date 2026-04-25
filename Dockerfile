FROM ubuntu:22.04

# Install OS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl git unzip rsync &&\
    apt-get clean &&\
    rm -rf /var/lib/apt/lists/*

# Install OpenJDK 17 JDK
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jdk &&\
    apt-get clean &&\
    rm -rf /var/lib/apt/lists/*

# Install the Android SDK command line tools
RUN curl -o /tmp/android-commandlinetools-linux.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip &&\
    cd /tmp &&\
    unzip /tmp/android-commandlinetools-linux.zip &&\
    mkdir -p /tmp/android/sdk/cmdline-tools &&\
    mv -v cmdline-tools /tmp/android/sdk/cmdline-tools/latest &&\
    chmod +x /tmp/android/sdk/cmdline-tools/latest/bin/*

# Refresh SSL certificates
RUN rm -f /etc/ssl/certs/ca-bundle.crt &&\
    apt-get update && apt-get reinstall -y --no-install-recommends ca-certificates &&\
    apt-get clean &&\
    rm -rf /var/lib/apt/lists/* &&\
    update-ca-certificates

# Install Node.js 22.x LTS, which is supported by Expo SDK 54.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - &&\
    apt-get install -y nodejs &&\
    apt-get clean &&\
    rm -rf /var/lib/apt/lists/*

ENV ANDROID_HOME=/tmp/android/sdk
ENV ANDROID_SDK_ROOT=/tmp/android/sdk
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools"

# Install JQ
RUN apt-get update && apt-get install -y --no-install-recommends jq &&\
    apt-get clean &&\
    rm -rf /var/lib/apt/lists/*

# Install file
RUN apt-get update && apt-get install -y --no-install-recommends file &&\
    apt-get clean &&\
    rm -rf /var/lib/apt/lists/*

ENTRYPOINT [ "./entrypoint.sh" ]
